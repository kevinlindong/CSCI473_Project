"""Tests for the from-scratch k-NN graph construction."""

import numpy as np
import pytest

from src.graph import knn_graph, knn_graph_via_retrieval


class TestKnnGraph:
    def test_output_type_and_tuple_shape(self):
        """Each edge must be a (int, int, float) triple."""
        rng = np.random.default_rng(0)
        X = rng.normal(size=(20, 6))
        edges = knn_graph(X, k_neighbors=3)
        assert isinstance(edges, list)
        for e in edges:
            assert len(e) == 3
            i, j, w = e
            assert isinstance(i, int) and isinstance(j, int)
            assert isinstance(w, float)

    def test_no_self_loops(self):
        rng = np.random.default_rng(1)
        X = rng.normal(size=(30, 8))
        edges = knn_graph(X, k_neighbors=5)
        for i, j, _ in edges:
            assert i != j

    def test_canonical_ordering(self):
        """Edges should be stored with i < j so the pair is unique."""
        rng = np.random.default_rng(2)
        X = rng.normal(size=(25, 4))
        edges = knn_graph(X, k_neighbors=4)
        for i, j, _ in edges:
            assert i < j

    def test_weights_in_cosine_range(self):
        """Cosine similarity is in [-1, 1] up to floating-point slack."""
        rng = np.random.default_rng(3)
        X = rng.normal(size=(30, 5))
        edges = knn_graph(X, k_neighbors=5)
        for _, _, w in edges:
            assert -1.0 - 1e-6 <= w <= 1.0 + 1e-6

    def test_unique_edges(self):
        rng = np.random.default_rng(4)
        X = rng.normal(size=(20, 4))
        edges = knn_graph(X, k_neighbors=3)
        pairs = [(i, j) for i, j, _ in edges]
        assert len(pairs) == len(set(pairs))

    def test_symmetric_coverage(self):
        """If j ∈ nn(i) OR i ∈ nn(j), edge (min(i,j), max(i,j)) should exist."""
        rng = np.random.default_rng(5)
        X = rng.normal(size=(15, 6))
        X /= np.linalg.norm(X, axis=1, keepdims=True)
        k = 4

        # Reference: recompute top-k per row directly.
        sim = X @ X.T
        np.fill_diagonal(sim, -np.inf)
        per_row_top_k = np.argsort(-sim, axis=1)[:, :k]

        expected: set[tuple[int, int]] = set()
        for i, row in enumerate(per_row_top_k):
            for j in row:
                a, b = (i, int(j)) if i < int(j) else (int(j), i)
                expected.add((a, b))

        edges = knn_graph(X, k_neighbors=k)
        got = {(i, j) for i, j, _ in edges}
        assert got == expected

    def test_minimum_degree_at_least_k(self):
        """Each node must be incident to at least k_neighbors edges (k-NN guarantee)."""
        rng = np.random.default_rng(6)
        X = rng.normal(size=(30, 8))
        k = 4
        edges = knn_graph(X, k_neighbors=k)
        degree = np.zeros(30, dtype=np.int64)
        for i, j, _ in edges:
            degree[i] += 1
            degree[j] += 1
        assert degree.min() >= k

    def test_k_larger_than_n_minus_one_clamps(self):
        """k=∞ should give the complete graph, not raise."""
        X = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [-1.0, 0.0]])
        edges = knn_graph(X, k_neighbors=100)
        assert len(edges) == 4 * 3 // 2  # complete graph on 4 nodes

    def test_empty_and_single_row_inputs(self):
        assert knn_graph(np.empty((0, 4)), k_neighbors=3) == []
        assert knn_graph(np.array([[1.0, 2.0]]), k_neighbors=3) == []

    def test_rejects_non_2d(self):
        with pytest.raises(ValueError):
            knn_graph(np.zeros(10), k_neighbors=3)

    def test_retrieval_implementation_matches(self):
        """knn_graph_via_retrieval should produce the same edge set as knn_graph."""
        rng = np.random.default_rng(7)
        X = rng.normal(size=(25, 6))
        a = {(i, j) for i, j, _ in knn_graph(X, k_neighbors=4)}
        b = {(i, j) for i, j, _ in knn_graph_via_retrieval(X, k_neighbors=4)}
        assert a == b
