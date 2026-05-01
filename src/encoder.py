"""Sentence-transformer wrapper.

`encode()` runs the standard pipeline (transformer → mean pool → L2-normalize).
`late_chunk_encode()` tokenizes a context-prefixed section as one sequence,
then mean-pools token embeddings within each chunk's character span — gives
every chunk full-section context via attention without a per-chunk prefix.
"""

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

import config


def load_model(model_name: str = config.ENCODER_MODEL_NAME) -> SentenceTransformer:
    return SentenceTransformer(model_name)


def encode(texts: list[str], model: SentenceTransformer = None) -> np.ndarray:
    """Standard sentence-transformer encoding. Returns L2-normalized (N, D)."""
    if model is None:
        model = load_model()
    return model.encode(texts, show_progress_bar=True, convert_to_numpy=True)


def late_chunk_encode(
    full_text: str,
    chunk_texts: list[str],
    model: SentenceTransformer,
) -> np.ndarray:
    """Encode `full_text` once, then mean-pool token embeddings per chunk's char span.

    Falls back to direct encoding for chunks whose tokens were truncated away.
    """
    dim = model.get_sentence_embedding_dimension()

    if not chunk_texts:
        return np.empty((0, dim), dtype=np.float32)

    transformer = model[0]
    tokenizer = transformer.tokenizer

    max_length = min(tokenizer.model_max_length, 8192)
    encoding = tokenizer(
        full_text,
        return_tensors="pt",
        return_offsets_mapping=True,
        truncation=True,
        max_length=max_length,
    )

    offsets: list[tuple[int, int]] = encoding["offset_mapping"][0].tolist()

    # offset_mapping is not a valid model input; strip before forward pass.
    device = next(transformer.auto_model.parameters()).device
    model_inputs = {
        k: v.to(device)
        for k, v in encoding.items()
        if k != "offset_mapping"
    }

    with torch.no_grad():
        outputs = transformer.auto_model(**model_inputs)

    token_embs: np.ndarray = outputs.last_hidden_state[0].cpu().numpy()

    chunk_embeddings: list[np.ndarray] = []
    search_pos = 0

    for chunk_text in chunk_texts:
        # Chunks are non-overlapping and ordered, so incrementing search_pos is O(n) total.
        char_start = full_text.find(chunk_text, search_pos)

        if char_start == -1:
            emb = model.encode(chunk_text, convert_to_numpy=True)
            chunk_embeddings.append(emb)
            continue

        char_end = char_start + len(chunk_text)
        search_pos = char_end

        # tok_start == tok_end indicates a special / zero-length token; skip.
        selected = [
            token_embs[i]
            for i, (tok_s, tok_e) in enumerate(offsets)
            if tok_s < tok_e
            and tok_e > char_start
            and tok_s < char_end
        ]

        if selected:
            emb = np.mean(selected, axis=0).astype(np.float32)
        else:
            emb = model.encode(chunk_text, convert_to_numpy=True)

        chunk_embeddings.append(emb)

    result = np.array(chunk_embeddings, dtype=np.float32)

    norms = np.linalg.norm(result, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    return result / norms
