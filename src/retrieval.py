"""From-scratch cosine similarity nearest-neighbor search.

Pure numpy. No sklearn / faiss / library similarity functions.
"""

from collections import defaultdict
from typing import Protocol

import numpy as np


def cosine_similarity(query_vec: np.ndarray, corpus_matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity of `query_vec` against every row of `corpus_matrix`.

    Zero-norm rows score 0 instead of NaN.
    """
    query_vec = np.asarray(query_vec).reshape(-1)
    corpus_matrix = np.asarray(corpus_matrix)

    dots = corpus_matrix @ query_vec
    row_norms = np.linalg.norm(corpus_matrix, axis=1)
    q_norm = float(np.linalg.norm(query_vec))

    if q_norm == 0.0:
        return np.zeros_like(dots)

    safe_row_norms = np.where(row_norms == 0.0, 1.0, row_norms)
    sims = dots / (safe_row_norms * q_norm)
    return np.where(row_norms == 0.0, 0.0, sims)


def top_k_indices(scores: np.ndarray, k: int) -> list[int]:
    """Top-k indices by descending score via O(N) argpartition + sort of k."""
    n = len(scores)
    if n == 0 or k <= 0:
        return []

    k = min(k, n)
    if k == n:
        return [int(i) for i in np.argsort(scores)[::-1]]

    top_unsorted = np.argpartition(scores, -k)[-k:]
    top_sorted = top_unsorted[np.argsort(scores[top_unsorted])[::-1]]
    return [int(i) for i in top_sorted]


def nearest_neighbors(query_vec: np.ndarray, corpus_matrix: np.ndarray, k: int) -> list[int]:
    return top_k_indices(cosine_similarity(query_vec, corpus_matrix), k)


def _score_per_paper(
    top_paper_ids: list,
    rows_by_paper: dict,
    embeddings: np.ndarray,
    query_vec: np.ndarray,
    top_per_paper: int,
) -> list:
    """Score passage rows within each top paper; return (paper_id, row, score) sorted by score desc."""
    results = []
    for pid in top_paper_ids:
        rows = rows_by_paper.get(pid, [])
        if not rows:
            continue
        sub_scores = cosine_similarity(query_vec, embeddings[rows])
        n_pick = min(top_per_paper, len(rows))
        local_order = np.argsort(sub_scores)[::-1][:n_pick]
        for local_idx in local_order:
            results.append((pid, rows[int(local_idx)], float(sub_scores[int(local_idx)])))
    results.sort(key=lambda t: t[2], reverse=True)
    return results


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
    """Two-stage retrieval: top-k abstracts, then their best chunks + captions.

    `query` may be a string (encoded here) or a pre-encoded np.ndarray.
    Returns {"paper_ids", "scores", "passages", "captions"}.
    """
    if isinstance(query, np.ndarray):
        query_vec = query.reshape(-1)
    else:
        from src import encoder as _encoder
        if model is None:
            model = _encoder.load_model()
        query_vec = _encoder.encode([str(query)], model)[0]

    abstract_scores = cosine_similarity(query_vec, abstract_embeddings)
    top_paper_rows = nearest_neighbors(query_vec, abstract_embeddings, k)

    abstract_ids = paper_index.get("abstracts", [])
    top_paper_ids = [abstract_ids[i] for i in top_paper_rows]
    top_paper_scores = [float(abstract_scores[i]) for i in top_paper_rows]
    top_id_set = set(top_paper_ids)

    title_lookup: dict[str, str] = {}
    for entry in paper_index.get("chunks", []):
        title_lookup.setdefault(entry["paper_id"], entry.get("paper_title", ""))

    chunk_rows_by_paper: dict[str, list[int]] = defaultdict(list)
    for row, entry in enumerate(paper_index.get("chunks", [])):
        if entry["paper_id"] in top_id_set:
            chunk_rows_by_paper[entry["paper_id"]].append(row)

    passages: list[dict] = []
    for pid, row, score in _score_per_paper(top_paper_ids, chunk_rows_by_paper, chunk_embeddings, query_vec, top_chunks_per_paper):
        entry = paper_index["chunks"][row]
        passages.append({
            "paper_id":    entry["paper_id"],
            "paper_title": entry.get("paper_title", ""),
            "heading":     entry.get("heading", ""),
            "text":        entry.get("text", ""),
            "score":       score,
        })

    caption_entries = paper_index.get("captions", [])

    def _entry_paper_id(e) -> str:
        # Current format: dict with 'paper_id'. Legacy: bare string.
        return e if isinstance(e, str) else e.get("paper_id", "")

    caption_rows_by_paper: dict[str, list[int]] = defaultdict(list)
    for row, entry in enumerate(caption_entries):
        pid = _entry_paper_id(entry)
        if pid in top_id_set:
            caption_rows_by_paper[pid].append(row)

    captions_out: list[dict] = []
    for pid, row, score in _score_per_paper(top_paper_ids, caption_rows_by_paper, caption_embeddings, query_vec, top_captions_per_paper):
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
            "score":    score,
        })

    return {
        "paper_ids": top_paper_ids,
        "scores":    top_paper_scores,
        "passages":  passages,
        "captions":  captions_out,
    }


class Retriever(Protocol):
    def retrieve(self, query, k: int = 5) -> dict: ...


class BruteForceRetriever:
    """Numpy cosine over the full abstract matrix."""

    def __init__(
        self,
        abstracts: np.ndarray,
        chunks: np.ndarray,
        captions: np.ndarray,
        paper_index: dict,
        encoder=None,
        top_chunks_per_paper: int = 3,
        top_captions_per_paper: int = 2,
    ):
        self.abstracts = abstracts
        self.chunks = chunks
        self.captions = captions
        self.paper_index = paper_index
        self.encoder = encoder
        self.top_chunks_per_paper = top_chunks_per_paper
        self.top_captions_per_paper = top_captions_per_paper

    def retrieve(self, query, k: int = 5) -> dict:
        return retrieve(
            query,
            abstract_embeddings=self.abstracts,
            chunk_embeddings=self.chunks,
            caption_embeddings=self.captions,
            paper_index=self.paper_index,
            k=k,
            model=self.encoder,
            top_chunks_per_paper=self.top_chunks_per_paper,
            top_captions_per_paper=self.top_captions_per_paper,
        )
