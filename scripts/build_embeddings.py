"""
build_embeddings.py — Encode the paper corpus into three embedding spaces.

Loads raw enriched papers, runs them through the sentence-transformer encoder,
and saves embedding matrices (.npy) to data/embeddings/.

Produces:
    - abstracts.npy  (N x D) — one vector per paper abstract
    - chunks.npy     (M x D) — one vector per text section/chunk
    - captions.npy   (C x D) — one vector per figure caption
    - index.json     — mapping from matrix row indices to paper IDs / metadata

Usage:
    python scripts/build_embeddings.py
"""

import json
import os
import sys

import numpy as np

# Allow imports from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.chunker import chunk_paper
from src.data import load_raw_papers, parse_paper
from src.encoder import encode, load_model


def build_embeddings():
    """Load corpus, encode, and save embedding matrices."""

    # --- Load papers ---
    print(f"Loading papers from {config.RAW_DIR} ...")
    raw_papers = load_raw_papers(config.RAW_DIR)
    papers = [parse_paper(r) for r in raw_papers]
    print(f"  {len(papers)} papers loaded")

    # --- Load encoder once (reused for all three spaces) ---
    print("Loading encoder model ...")
    model = load_model()

    # --- Abstract embeddings ---
    print("Encoding abstracts ...")
    abstract_ids = [p.paper_id for p in papers]
    abstract_texts = [p.abstract for p in papers]
    abstract_embs = encode(abstract_texts, model)
    print(f"  abstracts.npy: {abstract_embs.shape}")

    # --- Chunk embeddings ---
    print("Chunking papers and encoding chunks ...")
    all_chunks = []
    for paper in papers:
        all_chunks.extend(chunk_paper(paper))
    print(f"  {len(all_chunks)} chunks produced")

    chunk_texts = [c.text for c in all_chunks]
    chunk_embs = encode(chunk_texts, model)
    print(f"  chunks.npy: {chunk_embs.shape}")

    # --- Caption embeddings ---
    print("Encoding figure captions ...")
    caption_records = [
        (p.paper_id, fig.caption)
        for p in papers
        for fig in p.figures
        if fig.caption.strip()
    ]
    caption_ids = [r[0] for r in caption_records]
    caption_texts = [r[1] for r in caption_records]
    caption_embs = encode(caption_texts, model)
    print(f"  {len(caption_records)} captions produced")
    print(f"  captions.npy: {caption_embs.shape}")

    # --- Build index ---
    index = {
        "abstracts": abstract_ids,
        "chunks": [
            {
                "paper_id": c.paper_id,
                "paper_title": c.paper_title,
                "heading": c.heading,
                "parent_heading": c.parent_heading,
                "chunk_index": c.chunk_index,
                "level": c.level,
            }
            for c in all_chunks
        ],
        "captions": caption_ids,
    }

    # --- Save outputs ---
    os.makedirs(config.EMBEDDINGS_DIR, exist_ok=True)

    np.save(os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy"), abstract_embs)
    np.save(os.path.join(config.EMBEDDINGS_DIR, "chunks.npy"), chunk_embs)
    np.save(os.path.join(config.EMBEDDINGS_DIR, "captions.npy"), caption_embs)

    index_path = os.path.join(config.EMBEDDINGS_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    print(f"Saved embeddings to {config.EMBEDDINGS_DIR}")


if __name__ == "__main__":
    build_embeddings()
