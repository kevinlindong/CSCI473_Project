"""
encoder.py — Sentence-transformer wrapper for embedding text.

Provides a shared encoder used by all three embedding spaces
(abstract, chunk, caption). The model is loaded once and cached.
"""

import numpy as np


def load_model(model_name: str):
    """Load and return a sentence-transformer model."""
    raise NotImplementedError


def encode(texts: list[str], model=None) -> np.ndarray:
    """
    Encode a list of texts into dense vectors.

    Args:
        texts: List of strings to embed.
        model: Pre-loaded sentence-transformer model. If None, loads default.

    Returns:
        np.ndarray of shape (len(texts), embedding_dim).
    """
    raise NotImplementedError
