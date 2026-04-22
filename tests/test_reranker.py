"""Tests for the cross-encoder reranking fallback.

Uses a fake CrossEncoder injected via the `model=` parameter so the suite
runs without sentence-transformers / torch installed.
"""

import numpy as np
import pytest

from src.reranker import rerank, rerank_passages, should_rerank


class FakeCrossEncoder:
    """Stand-in for sentence_transformers.CrossEncoder.

    Scores each (query, passage) pair by the length of the passage so test
    expectations are deterministic and independent of any real model.
    """

    def __init__(self):
        self.last_pairs: list[tuple[str, str]] | None = None

    def predict(self, pairs):
        self.last_pairs = list(pairs)
        return np.array([float(len(p[1])) for p in pairs], dtype=np.float32)


@pytest.fixture
def fake_model():
    return FakeCrossEncoder()


# ---------------------------------------------------------------------------
# rerank — string-form primitive
# ---------------------------------------------------------------------------

class TestRerank:
    def test_returns_descending_scores(self, fake_model):
        result = rerank("q", ["a", "bbb", "cc"], model=fake_model)
        scores = [s for _, s in result]
        assert scores == sorted(scores, reverse=True)

    def test_reorders_by_cross_encoder_score(self, fake_model):
        # Fake model scores by passage length → "bbb" (3) > "cc" (2) > "a" (1)
        result = rerank("q", ["a", "bbb", "cc"], model=fake_model)
        assert [p for p, _ in result] == ["bbb", "cc", "a"]

    def test_preserves_all_passages(self, fake_model):
        passages = ["alpha", "beta", "gamma"]
        result = rerank("q", passages, model=fake_model)
        assert {p for p, _ in result} == set(passages)

    def test_empty_passages_returns_empty(self, fake_model):
        assert rerank("q", [], model=fake_model) == []
        # The model should not be called on empty input
        assert fake_model.last_pairs is None

    def test_pairs_query_with_each_passage(self, fake_model):
        rerank("my query", ["a", "b"], model=fake_model)
        assert fake_model.last_pairs == [("my query", "a"), ("my query", "b")]

    def test_returns_python_floats(self, fake_model):
        # Scores out of CrossEncoder.predict are np.float32 — the public API
        # should hand back native floats so JSON-serializing callers don't choke.
        result = rerank("q", ["x"], model=fake_model)
        assert isinstance(result[0][1], float)


# ---------------------------------------------------------------------------
# rerank_passages — operates on the dict form returned by retrieve()
# ---------------------------------------------------------------------------

class TestRerankPassages:
    def _passages(self):
        return [
            {"paper_id": "p1", "paper_title": "P1", "heading": "Intro",
             "text": "short", "score": 0.9},
            {"paper_id": "p2", "paper_title": "P2", "heading": "Method",
             "text": "much longer text body", "score": 0.5},
            {"paper_id": "p3", "paper_title": "P3", "heading": "Results",
             "text": "medium body", "score": 0.7},
        ]

    def test_reorders_by_cross_encoder_score(self, fake_model):
        # Fake model scores by text length → p2 (21) > p3 (11) > p1 (5)
        result = rerank_passages("q", self._passages(), model=fake_model)
        assert [p["paper_id"] for p in result] == ["p2", "p3", "p1"]

    def test_replaces_bi_encoder_score(self, fake_model):
        result = rerank_passages("q", self._passages(), model=fake_model)
        assert result[0]["score"] == float(len("much longer text body"))

    def test_preserves_metadata(self, fake_model):
        result = rerank_passages("q", self._passages(), model=fake_model)
        top = result[0]
        assert top["paper_id"] == "p2"
        assert top["paper_title"] == "P2"
        assert top["heading"] == "Method"
        assert top["text"] == "much longer text body"

    def test_does_not_mutate_input(self, fake_model):
        passages = self._passages()
        original_scores = [p["score"] for p in passages]
        rerank_passages("q", passages, model=fake_model)
        assert [p["score"] for p in passages] == original_scores

    def test_empty_passages(self, fake_model):
        assert rerank_passages("q", [], model=fake_model) == []
        assert fake_model.last_pairs is None


# ---------------------------------------------------------------------------
# should_rerank — confidence trigger from PLAN.md
# ---------------------------------------------------------------------------

class TestShouldRerank:
    def test_rlhf_notebook_regression_triggers(self):
        # Regression guard for the motivating ambiguous query from
        # notebooks/reranking.ipynb. Manual reranking improved this case, so
        # the default trigger should fire on the observed score profile.
        assert should_rerank(
            [0.6177, 0.5274, 0.5176, 0.4957, 0.4924],
        ) is True

    def test_low_top_score_triggers(self):
        assert should_rerank([0.3, 0.25, 0.2], score_threshold=0.5) is True

    def test_confident_top_with_wide_spread_does_not_trigger(self):
        assert should_rerank(
            [0.9, 0.6, 0.4],
            score_threshold=0.5,
            spread_threshold=0.15,
        ) is False

    def test_tight_spread_triggers_even_when_top_is_high(self):
        # All candidates bunched together → cosine cannot discriminate
        assert should_rerank(
            [0.62, 0.61, 0.60, 0.58],
            score_threshold=0.5,
            spread_threshold=0.15,
        ) is True

    def test_empty_scores_does_not_trigger(self):
        assert should_rerank([]) is False

    def test_single_score_only_checks_threshold(self):
        # Spread is undefined with one score — fall back to threshold check
        assert should_rerank([0.6], score_threshold=0.5) is False
        assert should_rerank([0.3], score_threshold=0.5) is True
