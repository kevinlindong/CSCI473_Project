"""
Tests for encoder.py — encode() and late_chunk_encode().

The model fixture is module-scoped so the model is downloaded and loaded
only once per test session, not once per test function.
"""

import numpy as np
import pytest
from sentence_transformers import SentenceTransformer

from src.encoder import encode, late_chunk_encode, load_model


@pytest.fixture(scope="module")
def model() -> SentenceTransformer:
    return load_model()


@pytest.fixture(scope="module")
def dim(model) -> int:
    return model.get_sentence_embedding_dimension()


# ---------------------------------------------------------------------------
# encode — standard sentence-level pipeline
# ---------------------------------------------------------------------------

class TestEncode:
    def test_returns_correct_shape(self, model, dim):
        texts = ["Hello world.", "Another sentence here."]
        embs = encode(texts, model)
        assert embs.shape == (2, dim)

    def test_single_text(self, model, dim):
        embs = encode(["Only one sentence."], model)
        assert embs.shape == (1, dim)

    def test_returns_float32(self, model):
        embs = encode(["Test sentence."], model)
        assert embs.dtype == np.float32

    def test_embeddings_are_l2_normalized(self, model):
        # The SentenceTransformer pipeline for all-mpnet-base-v2 includes a
        # Normalize layer, so encoded vectors should have unit norm.
        texts = ["Machine learning is fascinating.", "Deep neural networks."]
        embs = encode(texts, model)
        norms = np.linalg.norm(embs, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-5)

    def test_different_texts_differ(self, model):
        embs = encode(["Attention mechanisms in transformers.",
                       "Stochastic gradient descent optimization."], model)
        sim = float(np.dot(embs[0], embs[1]))
        assert sim < 0.99

    def test_identical_texts_match(self, model):
        text = "Self-supervised learning with contrastive objectives."
        embs = encode([text, text], model)
        sim = float(np.dot(embs[0], embs[1]))
        np.testing.assert_allclose(sim, 1.0, atol=1e-5)


# ---------------------------------------------------------------------------
# late_chunk_encode — token-level pooling per chunk span
# ---------------------------------------------------------------------------

class TestLateChunkEncode:
    def test_returns_correct_shape(self, model, dim):
        section = "Paragraph one about attention.\n\nParagraph two about transformers."
        chunks = ["Paragraph one about attention.", "Paragraph two about transformers."]
        full_text = f"Survey Paper | Introduction\n\n{section}"
        embs = late_chunk_encode(full_text, chunks, model)
        assert embs.shape == (2, dim)

    def test_single_chunk_whole_section(self, model, dim):
        section = "This section fits in one chunk with no splitting needed."
        full_text = f"Paper Title | Method\n\n{section}"
        embs = late_chunk_encode(full_text, [section], model)
        assert embs.shape == (1, dim)

    def test_empty_chunk_list_returns_empty(self, model, dim):
        embs = late_chunk_encode("Title | Section\n\nSome text.", [], model)
        assert embs.shape == (0, dim)

    def test_returns_float32(self, model):
        section = "A short section body."
        full_text = f"T | S\n\n{section}"
        embs = late_chunk_encode(full_text, [section], model)
        assert embs.dtype == np.float32

    def test_embeddings_are_l2_normalized(self, model):
        section = "First paragraph content.\n\nSecond paragraph content."
        chunks = ["First paragraph content.", "Second paragraph content."]
        full_text = f"Paper | Section\n\n{section}"
        embs = late_chunk_encode(full_text, chunks, model)
        norms = np.linalg.norm(embs, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-5)

    def test_semantically_different_chunks_differ(self, model):
        # Two topically distinct paragraphs should produce non-identical vectors
        section = (
            "Attention mechanisms allow models to focus on relevant tokens.\n\n"
            "Stochastic gradient descent updates weights using mini-batches."
        )
        chunks = [
            "Attention mechanisms allow models to focus on relevant tokens.",
            "Stochastic gradient descent updates weights using mini-batches.",
        ]
        full_text = f"ML Paper | Background\n\n{section}"
        embs = late_chunk_encode(full_text, chunks, model)
        sim = float(np.dot(embs[0], embs[1]))
        assert sim < 0.99

    def test_context_prefix_influences_chunk_embedding(self, model):
        # The same chunk text under two different section headings should produce
        # meaningfully different embeddings because the prefix tokens differ and
        # are attended to by the chunk's tokens via full-sequence self-attention.
        # Measured: sim ≈ 0.970 — asserting < 0.99 to verify real contextual shift,
        # not just floating-point non-determinism (sim < 1.0 would be trivially true).
        chunk = "This approach improves performance on downstream tasks."
        section_a = f"Paper A | Introduction\n\n{chunk}"
        section_b = f"Paper B | Conclusion\n\n{chunk}"
        emb_a = late_chunk_encode(section_a, [chunk], model)[0]
        emb_b = late_chunk_encode(section_b, [chunk], model)[0]
        sim = float(np.dot(emb_a, emb_b))
        # Vectors should be close (same content) but shifted by context (not identical)
        assert sim < 0.99

    def test_multiple_chunks_same_section_idx_consistent(self, model, dim):
        # All chunks from the same section encode in a single call and should
        # all come back as valid, normalized vectors
        paras = [f"Paragraph {i} with some content about topic {i}." for i in range(4)]
        section = "\n\n".join(paras)
        full_text = f"Research Paper | Experiments\n\n{section}"
        embs = late_chunk_encode(full_text, paras, model)
        assert embs.shape == (4, dim)
        norms = np.linalg.norm(embs, axis=1)
        np.testing.assert_allclose(norms, 1.0, atol=1e-5)
