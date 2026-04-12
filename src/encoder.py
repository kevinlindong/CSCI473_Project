"""
encoder.py — Sentence-transformer wrapper for embedding text.

Provides a shared encoder used by all three embedding spaces
(abstract, chunk, caption). The model is loaded once and cached.
"""

import numpy as np
from sentence_transformers import SentenceTransformer

import config


def load_model(model_name: str = config.ENCODER_MODEL_NAME) -> SentenceTransformer:
    """Load and return a sentence-transformer model.

    Args:
        model_name: HuggingFace model identifier. Defaults to config value.

    Returns:
        A loaded SentenceTransformer model.
    """
    return SentenceTransformer(model_name)


def encode(texts: list[str], model: SentenceTransformer = None) -> np.ndarray:
    """
    Encode a list of texts into dense vectors.

    Args:
        texts: List of strings to embed.
        model: Pre-loaded SentenceTransformer model. If None, loads the default
               model from config.

    Returns:
        np.ndarray of shape (len(texts), embedding_dim).
    """
    if model is None:
        model = load_model()
    embeddings = model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
    return embeddings
