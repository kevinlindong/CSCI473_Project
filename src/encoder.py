"""
encoder.py — Sentence-transformer wrapper for embedding text.

Provides two encoding paths:

  encode()             — Standard sentence-level encoding via the full
                         SentenceTransformer pipeline (transformer → pooling →
                         normalize). Used for abstracts and figure captions.

  late_chunk_encode()  — Late chunking: tokenizes the full context-prefixed
                         section text as a single sequence so every token
                         attends to the title and heading, then mean-pools the
                         token embeddings within each chunk's character span.
                         This eliminates the need to bake a context prefix into
                         every chunk's stored text; context is injected once and
                         shared across all chunks in the section.
"""

import numpy as np
import torch
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
    Encode a list of texts into dense vectors via the standard pipeline.

    The SentenceTransformer pipeline applies transformer encoding, mean
    pooling over non-padding tokens, and L2 normalization in sequence.

    Args:
        texts: List of strings to embed.
        model: Pre-loaded SentenceTransformer model. If None, loads the
               default model from config.

    Returns:
        np.ndarray of shape (len(texts), embedding_dim), L2-normalized.
    """
    if model is None:
        model = load_model()
    return model.encode(texts, show_progress_bar=True, convert_to_numpy=True)


def late_chunk_encode(
    full_text: str,
    chunk_texts: list[str],
    model: SentenceTransformer,
) -> np.ndarray:
    """
    Encode full_text as one sequence, then pool token embeddings per chunk.

    Procedure:
      1. Tokenize full_text (context-prefixed section) as a single sequence.
         Every token attends to the title and heading in the prefix via
         self-attention, so no per-chunk prefix duplication is needed.
      2. Run the transformer forward pass to obtain token-level embeddings.
      3. For each chunk_text, locate its character span within full_text and
         mean-pool the token embeddings whose offset mapping overlaps that span.
      4. L2-normalize each resulting vector.

    If a chunk's span has no mapped tokens (truncation beyond model max_length),
    the chunk is encoded directly via the standard pipeline as a fallback.

    Args:
        full_text:   Complete context-prefixed section text, typically
                     "Title | Heading\\n\\nsection body".
        chunk_texts: Raw paragraph-group texts that partition the section body.
                     Each element must be a contiguous substring of full_text.
        model:       Loaded SentenceTransformer.

    Returns:
        np.ndarray of shape (len(chunk_texts), embedding_dim), L2-normalized.
    """
    dim = model.get_sentence_embedding_dimension()

    if not chunk_texts:
        return np.empty((0, dim), dtype=np.float32)

    # Access the underlying transformer module (index 0 in the ST pipeline)
    transformer = model[0]
    tokenizer = transformer.tokenizer

    # Tokenize the full section with character-level offset mapping so we can
    # map each chunk's character span to the corresponding token indices.
    max_length = min(tokenizer.model_max_length, 8192)
    encoding = tokenizer(
        full_text,
        return_tensors="pt",
        return_offsets_mapping=True,
        truncation=True,
        max_length=max_length,
    )

    offsets: list[tuple[int, int]] = encoding["offset_mapping"][0].tolist()

    # Strip offset_mapping before passing to the model (not a valid model arg),
    # then move tensors to whichever device the model is on (CPU, CUDA, MPS).
    device = next(transformer.auto_model.parameters()).device
    model_inputs = {
        k: v.to(device)
        for k, v in encoding.items()
        if k != "offset_mapping"
    }

    # Forward pass — token-level embeddings, no pooling
    with torch.no_grad():
        outputs = transformer.auto_model(**model_inputs)

    # (1, seq_len, hidden_dim) → (seq_len, hidden_dim)
    token_embs: np.ndarray = outputs.last_hidden_state[0].cpu().numpy()

    chunk_embeddings: list[np.ndarray] = []
    search_pos = 0

    for chunk_text in chunk_texts:
        # Locate chunk within full_text sequentially (chunks are non-overlapping
        # and ordered, so incrementing search_pos is safe and O(n) total)
        char_start = full_text.find(chunk_text, search_pos)

        if char_start == -1:
            # Chunk text not found — fall back to direct encoding
            emb = model.encode(chunk_text, convert_to_numpy=True)
            chunk_embeddings.append(emb)
            continue

        char_end = char_start + len(chunk_text)
        search_pos = char_end

        # Collect token embeddings whose character range overlaps [char_start, char_end).
        # Tokens with tok_start == tok_end are special tokens ([CLS], [SEP], padding)
        # and are excluded.
        selected = [
            token_embs[i]
            for i, (tok_s, tok_e) in enumerate(offsets)
            if tok_s < tok_e                 # skip special / zero-length tokens
            and tok_e > char_start           # token ends after chunk start
            and tok_s < char_end             # token starts before chunk end
        ]

        if selected:
            emb = np.mean(selected, axis=0).astype(np.float32)
        else:
            # All chunk tokens were beyond the truncation point — fall back
            emb = model.encode(chunk_text, convert_to_numpy=True)

        chunk_embeddings.append(emb)

    result = np.array(chunk_embeddings, dtype=np.float32)

    # L2-normalize (mirrors the Normalize layer in the ST pipeline)
    norms = np.linalg.norm(result, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return result / norms
