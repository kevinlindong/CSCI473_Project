"""
compute_topic_graph.py — Build the topic-map artifact consumed by /api/topic-map.

Pipeline:
    1. Load abstract embeddings and the paper index produced by build_embeddings.py.
    2. If data/processed/papers.json is missing, materialize it from the raw
       enriched JSON files via src.data.save_corpus().
    3. Run k-means clustering in 768-d abstract space (from-scratch, numpy only).
    4. Build an undirected k-NN graph over cosine similarity.
    5. Generate a human-readable topic label per cluster using a small LLM
       (flan-T5-base by default). Can be skipped with --no-llm for fast iteration.
    6. Write data/processed/topic_graph.json with nodes, edges, clusters, meta.

Usage:
    python scripts/compute_topic_graph.py                # full pipeline with LLM
    python scripts/compute_topic_graph.py --no-llm       # skip LLM, use title fallback
    python scripts/compute_topic_graph.py --k 8          # override cluster count
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.clustering import assign_topic_labels, kmeans
from src.data import load_corpus, load_raw_papers, parse_paper, save_corpus
from src.graph import knn_graph


PROCESSED_PAPERS_PATH = os.path.join(config.PROCESSED_DIR, "papers.json")
TOPIC_GRAPH_PATH      = os.path.join(config.PROCESSED_DIR, "topic_graph.json")


def _ensure_papers_json() -> list:
    """Make sure data/processed/papers.json exists; return the Paper list."""
    if not os.path.exists(PROCESSED_PAPERS_PATH):
        print(f"Materializing {PROCESSED_PAPERS_PATH} from {config.RAW_DIR} ...")
        raw = load_raw_papers(config.RAW_DIR)
        papers = [parse_paper(r) for r in raw]
        save_corpus(papers, PROCESSED_PAPERS_PATH)
        print(f"  wrote {len(papers)} papers")
    return load_corpus(PROCESSED_PAPERS_PATH)


def compute_topic_graph(
    k: int,
    k_neighbors: int,
    use_llm: bool,
    seed: int,
    n_init: int,
    max_iter: int,
) -> None:
    # --- Load embeddings + index ---
    abstract_path = os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy")
    index_path    = os.path.join(config.EMBEDDINGS_DIR, "index.json")

    if not os.path.exists(abstract_path):
        raise FileNotFoundError(
            f"{abstract_path} not found. Run scripts/build_embeddings.py first."
        )

    print(f"Loading abstracts from {abstract_path} ...")
    abstracts = np.load(abstract_path)
    with open(index_path) as f:
        index = json.load(f)
    abstract_ids = index["abstracts"]
    print(f"  {abstracts.shape[0]} abstracts, dim={abstracts.shape[1]}")

    # --- Align papers to abstract rows ---
    all_papers = _ensure_papers_json()
    paper_by_id = {p.paper_id: p for p in all_papers}
    missing = [pid for pid in abstract_ids if pid not in paper_by_id]
    if missing:
        raise RuntimeError(
            f"{len(missing)} paper IDs in embeddings index are missing from "
            f"papers.json (first few: {missing[:3]}). "
            "Re-run scripts/build_embeddings.py to refresh the index."
        )
    papers = [paper_by_id[pid] for pid in abstract_ids]

    # --- K-means ---
    print(f"Running k-means (k={k}, n_init={n_init}, seed={seed}) ...")
    centroids, assignments, inertia = kmeans(
        abstracts, k=k, max_iter=max_iter, seed=seed, n_init=n_init
    )
    sizes = [int((assignments == j).sum()) for j in range(k)]
    print(f"  inertia={inertia:.3f}")
    print(f"  cluster sizes: {sizes}")

    # --- k-NN graph ---
    print(f"Building k-NN graph (k_neighbors={k_neighbors}) ...")
    edges = knn_graph(abstracts, k_neighbors=k_neighbors)
    print(f"  {len(edges)} undirected edges")

    # --- Labels ---
    llm_obj = None
    if use_llm:
        print(f"Loading LLM ({config.LLM_MODEL_NAME}) ...")
        import src.llm as llm_mod
        llm_obj = llm_mod
    else:
        print("Skipping LLM: using closest-paper titles as fallback labels.")

    print("Generating cluster labels ...")
    labels = assign_topic_labels(
        X=abstracts,
        centroids=centroids,
        papers=papers,
        assignments=assignments,
        llm=llm_obj,
    )
    for j, label in enumerate(labels):
        print(f"  cluster {j} ({sizes[j]:3d} papers): {label}")

    # --- Assemble artifact ---
    nodes = [
        {
            "paper_id": p.paper_id,
            "title":    p.title,
            "cluster":  int(assignments[i]),
        }
        for i, p in enumerate(papers)
    ]
    edge_records = [
        {"source": int(a), "target": int(b), "weight": float(w)}
        for (a, b, w) in edges
    ]
    cluster_records = [
        {"id": j, "label": labels[j], "size": sizes[j]}
        for j in range(k)
    ]

    artifact = {
        "nodes":    nodes,
        "edges":    edge_records,
        "clusters": cluster_records,
        "meta": {
            "k":            k,
            "k_neighbors":  k_neighbors,
            "seed":         seed,
            "n_init":       n_init,
            "max_iter":     max_iter,
            "encoder":      index.get("encoder_model", config.ENCODER_MODEL_NAME),
            "llm":          config.LLM_MODEL_NAME if use_llm else None,
            "inertia":      inertia,
        },
    }

    os.makedirs(config.PROCESSED_DIR, exist_ok=True)
    with open(TOPIC_GRAPH_PATH, "w") as f:
        json.dump(artifact, f, indent=2)
    print(f"\nWrote {TOPIC_GRAPH_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build data/processed/topic_graph.json")
    parser.add_argument("--k",            type=int, default=config.N_CLUSTERS,
                        help=f"Number of clusters (default: {config.N_CLUSTERS})")
    parser.add_argument("--k-neighbors",  type=int, default=config.KNN_NEIGHBORS,
                        help=f"k-NN edges per node (default: {config.KNN_NEIGHBORS})")
    parser.add_argument("--seed",         type=int, default=config.KMEANS_SEED,
                        help=f"Random seed (default: {config.KMEANS_SEED})")
    parser.add_argument("--n-init",       type=int, default=10,
                        help="k-means restarts (default: 10)")
    parser.add_argument("--max-iter",     type=int, default=config.KMEANS_MAX_ITER,
                        help=f"k-means max iterations (default: {config.KMEANS_MAX_ITER})")
    parser.add_argument("--no-llm",       action="store_true",
                        help="Skip LLM; use closest-paper titles as labels.")
    args = parser.parse_args()

    compute_topic_graph(
        k=args.k,
        k_neighbors=args.k_neighbors,
        use_llm=not args.no_llm,
        seed=args.seed,
        n_init=args.n_init,
        max_iter=args.max_iter,
    )
