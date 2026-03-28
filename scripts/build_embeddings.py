"""
build_embeddings.py — Encode the paper corpus into three embedding spaces.

Loads processed papers, runs them through the sentence-transformer encoder,
and saves embedding matrices (.npy) to data/embeddings/.

Produces:
    - abstracts.npy  (N x D) — one vector per paper abstract
    - chunks.npy     (M x D) — one vector per text section/chunk
    - captions.npy   (C x D) — one vector per figure caption
    - index.json     — mapping from matrix row indices to paper IDs

Usage:
    python scripts/build_embeddings.py
"""

import sys
import os

# Allow imports from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config


def build_embeddings():
    """Load corpus, encode, and save embedding matrices."""
    raise NotImplementedError


if __name__ == "__main__":
    build_embeddings()
