"""Tests for the from-scratch cosine similarity nearest-neighbor search."""

from collections import Counter

import numpy as np
import pytest

from src.retrieval import cosine_similarity, nearest_neighbors, retrieve


# ---------------------------------------------------------------------------
# cosine_similarity — dot / (row_norm * query_norm), no sklearn
# ---------------------------------------------------------------------------

class TestCosineSimilarity:
    def test_identical_vectors(self):
        """Identical vectors should have cosine similarity of 1.0."""
        v = np.array([1.0, 2.0, 3.0])
        sims = cosine_similarity(v, np.array([v]))
        np.testing.assert_allclose(sims, [1.0], atol=1e-7)

    def test_orthogonal_vectors(self):
        """Orthogonal vectors should have cosine similarity of 0.0."""
        q = np.array([1.0, 0.0, 0.0])
        M = np.array([[0.0, 1.0, 0.0]])
        sims = cosine_similarity(q, M)
        np.testing.assert_allclose(sims, [0.0], atol=1e-7)

    def test_opposite_vectors(self):
        """Vectors pointing in opposite directions should score -1.0."""
        q = np.array([1.0, 0.0, 0.0])
        M = np.array([[-1.0, 0.0, 0.0]])
        sims = cosine_similarity(q, M)
        np.testing.assert_allclose(sims, [-1.0], atol=1e-7)

    def test_magnitude_invariance(self):
        """Scaling a vector shouldn't change cosine similarity (only direction matters)."""
        q = np.array([1.0, 1.0, 1.0])
        M = np.array([
            [2.0, 2.0, 2.0],   # same direction, larger magnitude
            [0.5, 0.5, 0.5],   # same direction, smaller magnitude
        ])
        sims = cosine_similarity(q, M)
        np.testing.assert_allclose(sims, [1.0, 1.0], atol=1e-7)

    def test_returns_correct_shape(self):
        """Output shape should be (N,) for a (D,) query and (N, D) corpus."""
        rng = np.random.default_rng(0)
        q = rng.normal(size=5)
        M = rng.normal(size=(10, 5))
        sims = cosine_similarity(q, M)
        assert sims.shape == (10,)

    def test_matches_bare_dot_for_unit_norm_inputs(self):
        """For pre-normalized inputs, cosine_similarity must equal the raw dot product."""
        rng = np.random.default_rng(1)
        q = rng.normal(size=32)
        q /= np.linalg.norm(q)
        M = rng.normal(size=(20, 32))
        M /= np.linalg.norm(M, axis=1, keepdims=True)
        sims = cosine_similarity(q, M)
        np.testing.assert_allclose(sims, M @ q, atol=1e-6)

    def test_zero_query_returns_zeros(self):
        """A zero-norm query should produce all zeros (not NaN)."""
        q = np.zeros(4)
        M = np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]])
        sims = cosine_similarity(q, M)
        assert not np.any(np.isnan(sims))
        np.testing.assert_array_equal(sims, [0.0, 0.0])

    def test_zero_row_scores_zero_not_nan(self):
        """A zero-norm corpus row should produce 0.0 rather than NaN."""
        q = np.array([1.0, 0.0, 0.0])
        M = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, 0.0]])
        sims = cosine_similarity(q, M)
        assert not np.any(np.isnan(sims))
        np.testing.assert_allclose(sims, [1.0, 0.0], atol=1e-7)


# ---------------------------------------------------------------------------
# nearest_neighbors — argpartition then sort the top-k slice
# ---------------------------------------------------------------------------

class TestNearestNeighbors:
    def test_returns_k_results(self):
        """nearest_neighbors should return exactly k indices."""
        rng = np.random.default_rng(2)
        q = rng.normal(size=8)
        M = rng.normal(size=(25, 8))
        assert len(nearest_neighbors(q, M, k=5)) == 5

    def test_correct_order(self):
        """Results should be sorted by descending similarity."""
        rng = np.random.default_rng(3)
        q = rng.normal(size=6)
        M = rng.normal(size=(30, 6))
        indices = nearest_neighbors(q, M, k=7)
        scores = cosine_similarity(q, M)
        selected = [scores[i] for i in indices]
        assert selected == sorted(selected, reverse=True)

    def test_top_result_is_query_itself(self):
        """When the query equals a row of M, that row should rank first."""
        rng = np.random.default_rng(4)
        M = rng.normal(size=(20, 16))
        q = M[7].copy()
        assert nearest_neighbors(q, M, k=1)[0] == 7

    def test_k_larger_than_corpus(self):
        """k > N should return all N rows (sorted), not raise."""
        rng = np.random.default_rng(5)
        q = rng.normal(size=4)
        M = rng.normal(size=(3, 4))
        indices = nearest_neighbors(q, M, k=10)
        assert len(indices) == 3
        scores = cosine_similarity(q, M)
        assert [scores[i] for i in indices] == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# retrieve — two-stage pipeline over a handcrafted tiny index
# ---------------------------------------------------------------------------

@pytest.fixture
def tiny_corpus():
    """3 papers × 2 chunks each, plus 4 captions; abstract vectors are the
    standard basis so each paper owns a distinct axis and every test query
    can target a single paper unambiguously."""
    abstract_embs = np.eye(3, 4, dtype=np.float32)  # 3 x 4

    # Chunks: paper A along x, paper B along y, paper C along z. Second chunk
    # of each paper is a small perturbation so per-paper ordering is stable.
    chunk_embs = np.array([
        [1.00, 0.00, 0.00, 0.00],   # A chunk 0
        [0.90, 0.10, 0.00, 0.00],   # A chunk 1
        [0.00, 1.00, 0.00, 0.00],   # B chunk 0
        [0.00, 0.90, 0.10, 0.00],   # B chunk 1
        [0.00, 0.00, 1.00, 0.00],   # C chunk 0
        [0.00, 0.00, 0.90, 0.10],   # C chunk 1
    ], dtype=np.float32)
    chunk_embs /= np.linalg.norm(chunk_embs, axis=1, keepdims=True)

    caption_embs = np.array([
        [1.00, 0.00, 0.00, 0.00],   # A cap 0 (best A match)
        [0.95, 0.05, 0.00, 0.00],   # A cap 1
        [0.00, 1.00, 0.00, 0.00],   # B cap 0
        [0.00, 0.00, 1.00, 0.00],   # C cap 0
    ], dtype=np.float32)
    caption_embs /= np.linalg.norm(caption_embs, axis=1, keepdims=True)

    paper_index = {
        "encoder_model": "test",
        "abstracts": ["paper-A", "paper-B", "paper-C"],
        "chunks": [
            {"paper_id": "paper-A", "paper_title": "Paper A", "heading": "1Intro",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "A intro"},
            {"paper_id": "paper-A", "paper_title": "Paper A", "heading": "2Method",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "A method"},
            {"paper_id": "paper-B", "paper_title": "Paper B", "heading": "1Intro",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "B intro"},
            {"paper_id": "paper-B", "paper_title": "Paper B", "heading": "2Method",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "B method"},
            {"paper_id": "paper-C", "paper_title": "Paper C", "heading": "1Intro",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "C intro"},
            {"paper_id": "paper-C", "paper_title": "Paper C", "heading": "2Method",
             "parent_heading": "", "chunk_index": 0, "level": 1, "text": "C method"},
        ],
        "captions": [
            {"paper_id": "paper-A", "title": "Paper A", "caption": "Caption A0 - primary figure"},
            {"paper_id": "paper-A", "title": "Paper A", "caption": "Caption A1"},
            {"paper_id": "paper-B", "title": "Paper B", "caption": "Caption B0"},
            {"paper_id": "paper-C", "title": "Paper C", "caption": "Caption C0"},
        ],
    }
    return {
        "abstracts": abstract_embs,
        "chunks": chunk_embs,
        "captions": caption_embs,
        "index": paper_index,
    }


class TestRetrieve:
    def _query_a(self):
        return np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

    def test_returns_expected_shape_and_keys(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=2,
        )
        assert set(result.keys()) == {"paper_ids", "scores", "passages", "captions"}
        assert len(result["paper_ids"]) == 2
        assert len(result["scores"]) == 2
        # paper-A owns the x-axis, so it must rank first for an x-aligned query
        assert result["paper_ids"][0] == "paper-A"
        # Abstract scores should be sorted descending
        assert result["scores"] == sorted(result["scores"], reverse=True)

    def test_passages_sorted_globally_by_score(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=3,
        )
        scores = [p["score"] for p in result["passages"]]
        assert scores == sorted(scores, reverse=True)

    def test_respects_top_chunks_per_paper(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=3,
            top_chunks_per_paper=1,
        )
        per_paper = Counter(p["paper_id"] for p in result["passages"])
        assert max(per_paper.values()) == 1

    def test_respects_top_captions_per_paper(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=3,
            top_captions_per_paper=1,
        )
        per_paper = Counter(c["paper_id"] for c in result["captions"])
        assert max(per_paper.values()) == 1

    def test_returns_caption_text_for_dict_format(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=1,
            top_captions_per_paper=2,
        )
        assert result["captions"], "expected at least one caption for paper-A"
        assert result["captions"][0]["paper_id"] == "paper-A"
        assert result["captions"][0]["caption"].startswith("Caption A")
        assert result["captions"][0]["title"] == "Paper A"

    def test_handles_legacy_string_caption_format(self, tiny_corpus):
        legacy_index = dict(tiny_corpus["index"])
        legacy_index["captions"] = ["paper-A", "paper-A", "paper-B", "paper-C"]
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            legacy_index,
            k=1,
        )
        assert result["captions"]
        for c in result["captions"]:
            assert c["paper_id"] == "paper-A"
            assert c["caption"] == ""          # text unavailable in legacy format
            assert c["title"] == "Paper A"     # fell back to chunks' paper_title

    def test_top_chunks_belong_to_retrieved_papers(self, tiny_corpus):
        result = retrieve(
            self._query_a(),
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=2,
        )
        retrieved_ids = set(result["paper_ids"])
        for p in result["passages"]:
            assert p["paper_id"] in retrieved_ids

    def test_string_query_routes_through_encoder(self, tiny_corpus, monkeypatch):
        """When query is a string, retrieve must call src.encoder.encode with the model.

        Uses a fake src.encoder module inserted into sys.modules so the test
        runs even in environments without sentence-transformers installed.
        """
        import sys
        import types

        fake_vec = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
        calls = []

        def fake_encode(texts, model):
            calls.append((list(texts), model))
            return np.array([fake_vec])

        fake_module = types.ModuleType("src.encoder")
        fake_module.encode = fake_encode
        fake_module.load_model = lambda: (_ for _ in ()).throw(
            RuntimeError("load_model should not be called when model is provided")
        )
        monkeypatch.setitem(sys.modules, "src.encoder", fake_module)

        sentinel_model = object()
        result = retrieve(
            "efficient attention",
            tiny_corpus["abstracts"],
            tiny_corpus["chunks"],
            tiny_corpus["captions"],
            tiny_corpus["index"],
            k=1,
            model=sentinel_model,
        )
        assert calls == [(["efficient attention"], sentinel_model)]
        assert result["paper_ids"][0] == "paper-A"
