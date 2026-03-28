"""
retrieval.py — FROM-SCRATCH cosine similarity nearest-neighbor search.

This module implements cosine similarity and nearest-neighbor retrieval
using only numpy/torch. No sklearn or library-based similarity functions.

The retrieval pipeline:
1. Encode the user query into a vector.
2. Compute cosine similarity against the abstract embedding matrix.
3. Return the top-K most similar paper IDs.
4. Look up chunk and caption embeddings for those papers.
"""

import numpy as np


def cosine_similarity(query_vec: np.ndarray, corpus_matrix: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a query vector and every row in the corpus.

    cosine_sim(a, b) = dot(a, b) / (||a|| * ||b||)

    Args:
        query_vec: Shape (D,) — the query embedding.
        corpus_matrix: Shape (N, D) — the corpus embeddings.

    Returns:
        Shape (N,) — cosine similarity scores.
    """
    raise NotImplementedError


def nearest_neighbors(query_vec: np.ndarray, corpus_matrix: np.ndarray, k: int) -> list[int]:
    """
    Return indices of the top-k most similar vectors in the corpus.

    Args:
        query_vec: Shape (D,) — the query embedding.
        corpus_matrix: Shape (N, D) — the corpus embeddings.
        k: Number of neighbors to return.

    Returns:
        List of integer indices into corpus_matrix, sorted by descending similarity.
    """
    raise NotImplementedError


def retrieve(
    query: str,
    abstract_embeddings: np.ndarray,
    chunk_embeddings: np.ndarray,
    caption_embeddings: np.ndarray,
    paper_index: dict,
    k: int = 10,
) -> dict:
    """
    Full retrieval pipeline: encode query, search abstracts, look up chunks/captions.

    Args:
        query: Natural language query string.
        abstract_embeddings: Shape (N, D) — one vector per paper.
        chunk_embeddings: Shape (M, D) — one vector per text chunk.
        caption_embeddings: Shape (C, D) — one vector per figure caption.
        paper_index: Mapping from matrix row indices to paper IDs and metadata.
        k: Number of papers to retrieve.

    Returns:
        Dict with keys: paper_ids, passages, captions, scores.
    """
    raise NotImplementedError
