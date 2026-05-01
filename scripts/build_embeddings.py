"""Encode the paper corpus into abstract, chunk, and caption embeddings.

Chunk encoding uses late chunking: each section is tokenized as a single
context-prefixed sequence, the transformer runs once per section, and token
embeddings are mean-pooled within each chunk's character span.

Incremental by default; --rebuild re-encodes everything (required after
changing ENCODER_MODEL_NAME).
"""

import argparse
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


def _load_existing_index(index_path: str) -> dict:
    if os.path.exists(index_path):
        with open(index_path) as f:
            return json.load(f)
    return {"encoder_model": config.ENCODER_MODEL_NAME, "abstracts": [], "chunks": [], "captions": []}


def _load_existing_matrix(path: str) -> np.ndarray | None:
    if os.path.exists(path):
        return np.load(path)
    return None


def _encode_papers(papers, model):
    abstract_ids = [p.paper_id for p in papers]
    abstract_texts = [p.abstract for p in papers]
    abstract_embs = encode(abstract_texts, model)

    all_chunks = []
    all_chunk_embs: list[np.ndarray] = []

    for paper in papers:
        paper_chunks = chunk_paper(paper)
        if not paper_chunks:
            continue

        section_groups: dict[int, list] = defaultdict(list)
        for chunk in paper_chunks:
            section_groups[chunk.section_idx].append(chunk)

        for sec_idx in sorted(section_groups.keys()):
            chunks = section_groups[sec_idx]
            c0 = chunks[0]

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

    caption_records = [
        {"paper_id": p.paper_id, "title": p.title, "caption": fig.caption}
        for p in papers
        for fig in p.figures
        if fig.caption.strip()
    ]
    caption_texts = [f"{r['title']}\n\n{r['caption']}" for r in caption_records]
    caption_embs = (
        encode(caption_texts, model)
        if caption_texts
        else np.empty((0, config.EMBEDDING_DIM), dtype=np.float32)
    )

    return abstract_ids, abstract_embs, all_chunks, chunk_embs, caption_records, caption_embs


def build_embeddings(rebuild: bool = False):
    os.makedirs(config.EMBEDDINGS_DIR, exist_ok=True)

    abstract_path = os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy")
    chunk_path    = os.path.join(config.EMBEDDINGS_DIR, "chunks.npy")
    caption_path  = os.path.join(config.EMBEDDINGS_DIR, "captions.npy")
    index_path    = os.path.join(config.EMBEDDINGS_DIR, "index.json")

    existing_index = _load_existing_index(index_path)

    if not rebuild:
        stored_model = existing_index.get("encoder_model", "")
        if stored_model and stored_model != config.ENCODER_MODEL_NAME:
            raise RuntimeError(
                f"Encoder mismatch: index was built with '{stored_model}' "
                f"but config says '{config.ENCODER_MODEL_NAME}'. "
                f"Run with --rebuild to re-encode the full corpus."
            )
        if any(isinstance(c, str) for c in existing_index.get("captions", [])):
            raise RuntimeError(
                "Caption index uses the legacy paper_id-only format. "
                "Run with --rebuild to migrate to the current format "
                "(dicts with paper_id, title, caption)."
            )

    existing_ids: set[str] = set(existing_index.get("abstracts", []))

    print(f"Loading papers from {config.RAW_DIR} ...")
    raw_papers = load_raw_papers(config.RAW_DIR)
    all_papers = [parse_paper(r) for r in raw_papers]
    print(f"  {len(all_papers)} papers on disk")

    if rebuild:
        papers_to_encode = all_papers
        print("  --rebuild: re-encoding all papers")
    else:
        papers_to_encode = [p for p in all_papers if p.paper_id not in existing_ids]
        print(f"  {len(existing_ids)} already encoded, {len(papers_to_encode)} new")

    if not papers_to_encode and not rebuild:
        print("Nothing to encode. Use --rebuild to force a full recompute.")
        return

    print("Loading encoder model ...")
    model = load_model()

    print(f"Encoding {len(papers_to_encode)} papers ...")
    (
        new_abstract_ids,
        new_abstract_embs,
        new_chunks,
        new_chunk_embs,
        new_caption_records,
        new_caption_embs,
    ) = _encode_papers(papers_to_encode, model)

    print(f"  abstracts: {new_abstract_embs.shape}")
    print(f"  chunks:    {new_chunk_embs.shape}")
    print(f"  captions:  {new_caption_embs.shape}")

    if rebuild:
        abstract_embs = new_abstract_embs
        chunk_embs    = new_chunk_embs
        caption_embs  = new_caption_embs

        merged_abstract_ids = new_abstract_ids
        merged_chunk_entries = [
            {
                "paper_id":      c.paper_id,
                "paper_title":   c.paper_title,
                "heading":       c.heading,
                "parent_heading": c.parent_heading,
                "chunk_index":   c.chunk_index,
                "level":         c.level,
                "text":          c.text,
            }
            for c in new_chunks
        ]
        merged_caption_records = list(new_caption_records)

    else:
        existing_abstract_embs = _load_existing_matrix(abstract_path)
        existing_chunk_embs    = _load_existing_matrix(chunk_path)
        existing_caption_embs  = _load_existing_matrix(caption_path)

        def _vstack_safe(existing, new):
            if existing is None:
                return new
            if new.shape[0] == 0:
                return existing
            return np.vstack([existing, new])

        abstract_embs = _vstack_safe(existing_abstract_embs, new_abstract_embs)
        chunk_embs    = _vstack_safe(existing_chunk_embs, new_chunk_embs)
        caption_embs  = _vstack_safe(existing_caption_embs, new_caption_embs)

        merged_abstract_ids = existing_index.get("abstracts", []) + new_abstract_ids
        merged_chunk_entries = existing_index.get("chunks", []) + [
            {
                "paper_id":      c.paper_id,
                "paper_title":   c.paper_title,
                "heading":       c.heading,
                "parent_heading": c.parent_heading,
                "chunk_index":   c.chunk_index,
                "level":         c.level,
                "text":          c.text,
            }
            for c in new_chunks
        ]
        merged_caption_records = existing_index.get("captions", []) + list(new_caption_records)

    print(f"\nFinal corpus:")
    print(f"  abstracts.npy: {abstract_embs.shape}")
    print(f"  chunks.npy:    {chunk_embs.shape}")
    print(f"  captions.npy:  {caption_embs.shape}")

    np.save(abstract_path, abstract_embs)
    np.save(chunk_path,    chunk_embs)
    np.save(caption_path,  caption_embs)

    index = {
        "encoder_model": config.ENCODER_MODEL_NAME,
        "abstracts": merged_abstract_ids,
        "chunks": merged_chunk_entries,
        "captions": merged_caption_records,
    }
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    print(f"Saved to {config.EMBEDDINGS_DIR}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Re-encode all papers from scratch (required after changing encoder model)",
    )
    args = parser.parse_args()
    build_embeddings(rebuild=args.rebuild)