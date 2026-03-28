"""
reranker.py — Cross-encoder reranking fallback.

Uses a pretrained cross-encoder model to re-score candidate passages
when abstract-level retrieval produces low-confidence results.
"""

import numpy as np


def load_reranker(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """Load a pretrained cross-encoder model."""
    raise NotImplementedError


def rerank(query: str, passages: list[str], model=None) -> list[tuple[str, float]]:
    """
    Re-score passages using a cross-encoder and return sorted by relevance.

    Args:
        query: The user's natural language query.
        passages: List of candidate text passages.
        model: Pre-loaded cross-encoder. If None, loads default.

    Returns:
        List of (passage, score) tuples sorted by descending score.
    """
    raise NotImplementedError
