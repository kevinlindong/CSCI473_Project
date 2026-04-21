"""
retrieval.py — FROM-SCRATCH cosine similarity nearest-neighbor search.

This module implements cosine similarity and nearest-neighbor retrieval
using only numpy primitives. No sklearn, no faiss, no library-based
similarity functions.

The retrieval pipeline:
1. Encode the user query into a vector.
2. Compute cosine similarity against the abstract embedding matrix.
3. Return the top-K most similar paper IDs.
4. Look up chunk and caption embeddings for those papers and rank them
   against the same query vector so downstream callers (reranker, LLM
   context builder) receive best-first passages and captions.
"""

from collections import defaultdict

import numpy as np


def cosine_similarity(query_vec: np.ndarray, corpus_matrix: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a query vector and every row in the corpus.

    cosine_sim(a, b) = dot(a, b) / (||a|| * ||b||)

    Implemented from first principles with numpy primitives only. Works on
    both normalized and unnormalized inputs. If a row (or the query) has
    zero norm, its score is forced to 0.0 rather than producing NaN.

    Args:
        query_vec: Shape (D,) — the query embedding.
        corpus_matrix: Shape (N, D) — the corpus embeddings.

    Returns:
        Shape (N,) — cosine similarity scores, each in [-1.0, 1.0].
    """
    query_vec = np.asarray(query_vec).reshape(-1)
    corpus_matrix = np.asarray(corpus_matrix)

    dots = corpus_matrix @ query_vec                          # (N,)
    row_norms = np.linalg.norm(corpus_matrix, axis=1)         # (N,)
    q_norm = float(np.linalg.norm(query_vec))                 # scalar

    if q_norm == 0.0:
        return np.zeros_like(dots)

    safe_row_norms = np.where(row_norms == 0.0, 1.0, row_norms)
    sims = dots / (safe_row_norms * q_norm)
    # Zero-norm rows: force score to 0 instead of dividing by the fill value
    return np.where(row_norms == 0.0, 0.0, sims)


def nearest_neighbors(query_vec: np.ndarray, corpus_matrix: np.ndarray, k: int) -> list[int]:
    """
    Return indices of the top-k most similar vectors in the corpus.

    Uses np.argpartition for an O(N) unordered top-k selection followed by
    np.argsort on just those k candidates — avoids a full O(N log N) sort.

    Args:
        query_vec: Shape (D,) — the query embedding.
        corpus_matrix: Shape (N, D) — the corpus embeddings.
        k: Number of neighbors to return. Clamped to len(corpus_matrix) when larger.

    Returns:
        List of integer indices into corpus_matrix, sorted by descending similarity.
    """
    scores = cosine_similarity(query_vec, corpus_matrix)
    n = len(scores)
    if n == 0 or k <= 0:
        return []

    k = min(k, n)
    if k == n:
        return [int(i) for i in np.argsort(scores)[::-1]]

    top_unsorted = np.argpartition(scores, -k)[-k:]
    top_sorted = top_unsorted[np.argsort(scores[top_unsorted])[::-1]]
    return [int(i) for i in top_sorted]


def retrieve(
    query,
    abstract_embeddings: np.ndarray,
    chunk_embeddings: np.ndarray,
    caption_embeddings: np.ndarray,
    paper_index: dict,
    k: int = 5,
    model=None,
    top_chunks_per_paper: int = 3,
    top_captions_per_paper: int = 2,
) -> dict:
    """
    Full retrieval pipeline: encode query, search abstracts, look up chunks/captions.

    Two-stage retrieval:
      1. Cosine k-NN over abstract_embeddings → top-k paper IDs.
      2. For each retrieved paper, score its chunks and captions against the
         same query vector and keep the top_chunks_per_paper / top_captions_per_paper
         of each. Passages and captions are then flattened and sorted globally
         by descending score.

    Args:
        query: Natural-language string OR a pre-encoded np.ndarray of shape (D,).
               Strings are encoded via the sentence transformer; pre-encoded
               vectors skip the encoder entirely (useful for tests).
        abstract_embeddings: Shape (N, D) — one vector per paper.
        chunk_embeddings:    Shape (M, D) — one vector per text chunk.
        caption_embeddings:  Shape (C, D) — one vector per figure caption.
        paper_index: Index dict produced by scripts/build_embeddings.py. Expected
                     keys: 'abstracts' (list[str]), 'chunks' (list[dict]),
                     'captions' (list[dict] with paper_id/title/caption, or
                     list[str] of paper_ids for legacy indices).
        k: Number of papers to retrieve from abstract search.
        model: Pre-loaded SentenceTransformer. Lazy-loaded via load_model()
               only when query is a string AND model is None.
        top_chunks_per_paper: Cap on chunks returned per retrieved paper.
        top_captions_per_paper: Cap on captions returned per retrieved paper.

    Returns:
        {
          "paper_ids": list[str],    # top-k papers, ordered by abstract score
          "scores":    list[float],  # abstract-level scores aligned with paper_ids
          "passages":  list[dict],   # each: {paper_id, paper_title, heading, text, score}
          "captions":  list[dict],   # each: {paper_id, title, caption, score}
        }
    """
    # --- Encode query (or accept a pre-encoded vector) ---
    if isinstance(query, np.ndarray):
        query_vec = query.reshape(-1)
    else:
        # Lazy import so callers that pass a pre-encoded np.ndarray never pay
        # the sentence-transformers / torch import cost.
        from src import encoder as _encoder
        if model is None:
            model = _encoder.load_model()
        query_vec = _encoder.encode([str(query)], model)[0]

    # --- Stage 1: top-k abstracts ---
    abstract_scores = cosine_similarity(query_vec, abstract_embeddings)
    top_paper_rows = nearest_neighbors(query_vec, abstract_embeddings, k)

    abstract_ids = paper_index.get("abstracts", [])
    top_paper_ids = [abstract_ids[i] for i in top_paper_rows]
    top_paper_scores = [float(abstract_scores[i]) for i in top_paper_rows]
    top_id_set = set(top_paper_ids)

    # Chunks carry paper_title inline; reuse as a fallback for caption title
    title_lookup: dict[str, str] = {}
    for entry in paper_index.get("chunks", []):
        title_lookup.setdefault(entry["paper_id"], entry.get("paper_title", ""))

    # --- Stage 2: chunks within the top-k papers ---
    chunk_rows_by_paper: dict[str, list[int]] = defaultdict(list)
    for row, entry in enumerate(paper_index.get("chunks", [])):
        if entry["paper_id"] in top_id_set:
            chunk_rows_by_paper[entry["paper_id"]].append(row)

    passages: list[dict] = []
    for pid in top_paper_ids:
        rows = chunk_rows_by_paper.get(pid, [])
        if not rows:
            continue
        sub_scores = cosine_similarity(query_vec, chunk_embeddings[rows])
        n_pick = min(top_chunks_per_paper, len(rows))
        local_order = np.argsort(sub_scores)[::-1][:n_pick]
        for local_idx in local_order:
            row = rows[int(local_idx)]
            entry = paper_index["chunks"][row]
            passages.append({
                "paper_id":    entry["paper_id"],
                "paper_title": entry.get("paper_title", ""),
                "heading":     entry.get("heading", ""),
                "text":        entry.get("text", ""),
                "score":       float(sub_scores[int(local_idx)]),
            })
    passages.sort(key=lambda p: p["score"], reverse=True)

    # --- Stage 3: captions within the top-k papers ---
    caption_entries = paper_index.get("captions", [])

    def _entry_paper_id(e) -> str:
        # Current format: dict with 'paper_id'. Legacy format: bare string.
        return e if isinstance(e, str) else e.get("paper_id", "")

    caption_rows_by_paper: dict[str, list[int]] = defaultdict(list)
    for row, entry in enumerate(caption_entries):
        pid = _entry_paper_id(entry)
        if pid in top_id_set:
            caption_rows_by_paper[pid].append(row)

    captions_out: list[dict] = []
    for pid in top_paper_ids:
        rows = caption_rows_by_paper.get(pid, [])
        if not rows:
            continue
        sub_scores = cosine_similarity(query_vec, caption_embeddings[rows])
        n_pick = min(top_captions_per_paper, len(rows))
        local_order = np.argsort(sub_scores)[::-1][:n_pick]
        for local_idx in local_order:
            row = rows[int(local_idx)]
            entry = caption_entries[row]
            if isinstance(entry, dict):
                caption_text = entry.get("caption", "")
                title = entry.get("title", title_lookup.get(pid, ""))
            else:
                caption_text = ""
                title = title_lookup.get(pid, "")
            captions_out.append({
                "paper_id": pid,
                "title":    title,
                "caption":  caption_text,
                "score":    float(sub_scores[int(local_idx)]),
            })
    captions_out.sort(key=lambda c: c["score"], reverse=True)

    return {
        "paper_ids": top_paper_ids,
        "scores":    top_paper_scores,
        "passages":  passages,
        "captions":  captions_out,
    }
