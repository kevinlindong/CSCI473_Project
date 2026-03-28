"""
figures.py — CLIP-based figure encoding fallback.

Uses CLIP to encode figure images when captions are absent or low-quality.
This is a secondary feature — can be stubbed if time is limited.
"""

import numpy as np


def load_clip_model(model_name: str = "openai/clip-vit-base-patch32"):
    """Load a pretrained CLIP model for image encoding."""
    raise NotImplementedError


def encode_image(image_path: str, model=None) -> np.ndarray:
    """
    Encode a figure image into a dense vector using CLIP.

    Args:
        image_path: Path to the image file.
        model: Pre-loaded CLIP model. If None, loads default.

    Returns:
        np.ndarray of shape (embedding_dim,).
    """
    raise NotImplementedError
