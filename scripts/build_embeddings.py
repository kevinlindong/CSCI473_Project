"""
build_embeddings.py — Encode the paper corpus into three embedding spaces.

Loads raw enriched papers, runs them through the sentence-transformer encoder,
and saves embedding matrices (.npy) to data/embeddings/.

Chunk encoding uses late chunking: each section is tokenized as a single
context-prefixed sequence ("Title | Heading\\n\\nsection body"), the transformer
runs once per section, and token embeddings are mean-pooled within each chunk's
character span. This gives every chunk full-section context via attention without
baking a per-chunk prefix into stored text.

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
from collections import defaultdict

import numpy as np

# Allow imports from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.chunker import chunk_paper
from src.data import load_raw_papers, parse_paper
from src.encoder import encode, late_chunk_encode, load_model


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

    # --- Chunk embeddings via late chunking ---
    # Each section is encoded as one sequence ("Title | Heading\n\nsection body")
    # so all chunk tokens attend to the context prefix. Token embeddings are then
    # mean-pooled within each chunk's character span.
    print("Chunking and late-encoding sections ...")
    all_chunks = []
    all_chunk_embs: list[np.ndarray] = []

    for paper in papers:
        paper_chunks = chunk_paper(paper)
        if not paper_chunks:
            continue

        # Group chunks by section_idx (each section encodes as one sequence)
        section_groups: dict[int, list] = defaultdict(list)
        for chunk in paper_chunks:
            section_groups[chunk.section_idx].append(chunk)

        for sec_idx in sorted(section_groups.keys()):
            chunks = section_groups[sec_idx]
            c0 = chunks[0]

            # Build context prefix — injected once for the whole section
            if c0.parent_heading:
                prefix = f"{c0.paper_title} | {c0.parent_heading} | {c0.heading}"
            else:
                prefix = f"{c0.paper_title} | {c0.heading}"

            full_text = f"{prefix}\n\n{c0.section_text}"
            chunk_texts = [c.text for c in chunks]

            section_embs = late_chunk_encode(full_text, chunk_texts, model)
            all_chunk_embs.append(section_embs)
            all_chunks.extend(chunks)

    chunk_embs = (
        np.vstack(all_chunk_embs)
        if all_chunk_embs
        else np.empty((0, config.EMBEDDING_DIM), dtype=np.float32)
    )
    print(f"  {len(all_chunks)} chunks produced")
    print(f"  chunks.npy: {chunk_embs.shape}")

    # --- Caption embeddings ---
    # Captions are prefixed with the paper title so a query can retrieve
    # figure-level results in the context of the right paper.
    print("Encoding figure captions ...")
    caption_records = [
        (p.paper_id, p.title, fig.caption)
        for p in papers
        for fig in p.figures
        if fig.caption.strip()
    ]
    caption_ids = [r[0] for r in caption_records]
    caption_texts = [f"{r[1]}\n\n{r[2]}" for r in caption_records]
    caption_embs = encode(caption_texts, model)
    print(f"  {len(caption_records)} captions produced")
    print(f"  captions.npy: {caption_embs.shape}")

    # --- Build index ---
    # section_text is intentionally excluded — it's large and only needed at
    # encode time. text (raw chunk content) is included for display at retrieval.
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
                "text": c.text,
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
