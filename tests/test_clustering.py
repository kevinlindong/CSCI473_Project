"""Tests for the from-scratch k-means clustering."""

import numpy as np
import pytest

from src.clustering import kmeans, assign_topic_labels


# ---------------------------------------------------------------------------
# Contract: shapes, seeding, validation
# ---------------------------------------------------------------------------


class TestKMeansContract:
    def test_output_shapes(self):
        """Centroids must be (k, D), assignments (N,), inertia a scalar."""
        rng = np.random.default_rng(0)
        X = rng.normal(size=(50, 8))
        centroids, assignments, inertia = kmeans(X, k=3, n_init=2, seed=0)
        assert centroids.shape == (3, 8)
        assert assignments.shape == (50,)
        assert isinstance(inertia, float)

    def test_all_points_assigned_valid(self):
        """Every assignment must be in [0, k) — no unassigned or out-of-range IDs."""
        rng = np.random.default_rng(1)
        X = rng.normal(size=(40, 6))
        _, assignments, _ = kmeans(X, k=4, n_init=2, seed=0)
        assert assignments.min() >= 0
        assert assignments.max() < 4

    def test_inertia_non_negative(self):
        """Sum of squared distances is non-negative by construction."""
        rng = np.random.default_rng(2)
        X = rng.normal(size=(30, 5))
        _, _, inertia = kmeans(X, k=3, n_init=2, seed=0)
        assert inertia >= 0

    def test_deterministic_with_seed(self):
        """Same seed must produce identical centroids and assignments."""
        rng = np.random.default_rng(3)
        X = rng.normal(size=(40, 6))
        out1 = kmeans(X, k=4, n_init=3, seed=7)
        out2 = kmeans(X, k=4, n_init=3, seed=7)
        np.testing.assert_array_equal(out1[1], out2[1])
        np.testing.assert_allclose(out1[0], out2[0], atol=1e-10)
        assert out1[2] == out2[2]

    def test_raises_on_bad_k(self):
        X = np.zeros((5, 3))
        with pytest.raises(ValueError):
            kmeans(X, k=0)
        with pytest.raises(ValueError):
            kmeans(X, k=6)  # k > N

    def test_raises_on_bad_ndim(self):
        X = np.zeros(10)
        with pytest.raises(ValueError):
            kmeans(X, k=2)

    def test_raises_on_bad_init(self):
        X = np.random.default_rng(0).normal(size=(10, 3))
        with pytest.raises(ValueError):
            kmeans(X, k=2, init="bogus")


# ---------------------------------------------------------------------------
# Convergence on well-separated clusters
# ---------------------------------------------------------------------------


class TestKMeansConvergence:
    @staticmethod
    def _three_blobs(seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
        """Three well-separated 2-D Gaussian blobs for recovery tests."""
        rng = np.random.default_rng(seed)
        centers = np.array([[0.0, 0.0], [10.0, 0.0], [5.0, 8.0]])
        points_per = 40
        X = np.vstack([
            centers[i] + rng.normal(scale=0.3, size=(points_per, 2))
            for i in range(3)
        ])
        true = np.repeat(np.arange(3), points_per)
        return X, true

    def test_recovers_well_separated_blobs(self):
        """On well-separated blobs, kmeans recovers the partition up to a
        permutation of cluster labels."""
        X, true = self._three_blobs(seed=0)
        _, pred, _ = kmeans(X, k=3, n_init=10, seed=0, spherical=False)

        # Permutation-invariant comparison via pairwise same-cluster agreement.
        true_pairs = (true[:, None] == true[None, :])
        pred_pairs = (pred[:, None] == pred[None, :])
        agreement = (true_pairs == pred_pairs).mean()
        assert agreement > 0.99, f"only {agreement:.3f} pair agreement"

    def test_inertia_much_better_than_random(self):
        """The optimum must beat a random partition by a wide margin."""
        X, _ = self._three_blobs(seed=1)
        _, _, inertia = kmeans(X, k=3, n_init=10, seed=0, spherical=False)

        rng = np.random.default_rng(99)
        random_assg = rng.integers(0, 3, size=X.shape[0])
        random_centroids = np.stack([
            X[random_assg == j].mean(axis=0) for j in range(3)
        ])
        diffs = X - random_centroids[random_assg]
        random_inertia = float(np.einsum("ij,ij->", diffs, diffs))
        assert inertia < random_inertia / 2


# ---------------------------------------------------------------------------
# Empty-cluster reinitialization
# ---------------------------------------------------------------------------


class TestKMeansEmptyClusterRecovery:
    def test_no_nan_with_duplicate_points(self):
        """When all rows coincide, multiple centroids start on top of each other.
        Empty-cluster reinit must not leak NaNs into the output."""
        X = np.tile(np.array([[1.0, 2.0, 3.0]]), (20, 1))
        centroids, assignments, _ = kmeans(
            X, k=3, n_init=2, seed=0, spherical=False
        )
        assert not np.any(np.isnan(centroids))
        assert np.all(assignments >= 0) and np.all(assignments < 3)


# ---------------------------------------------------------------------------
# Spherical variant (relevant for unit-normalized embeddings)
# ---------------------------------------------------------------------------


class TestKMeansSpherical:
    def test_spherical_centroids_are_unit_norm(self):
        """With spherical=True, centroids should sit on the unit sphere."""
        rng = np.random.default_rng(5)
        X = rng.normal(size=(60, 16))
        X /= np.linalg.norm(X, axis=1, keepdims=True)
        centroids, _, _ = kmeans(X, k=4, n_init=3, seed=0, spherical=True)
        norms = np.linalg.norm(centroids, axis=1)
        np.testing.assert_allclose(norms, np.ones(4), atol=1e-6)

    def test_non_spherical_centroids_drift_inside(self):
        """Without renormalization, mean-of-unit-vectors drifts off the sphere."""
        rng = np.random.default_rng(6)
        X = rng.normal(size=(60, 16))
        X /= np.linalg.norm(X, axis=1, keepdims=True)
        centroids, _, _ = kmeans(X, k=4, n_init=3, seed=0, spherical=False)
        norms = np.linalg.norm(centroids, axis=1)
        assert np.any(norms < 0.999)


# ---------------------------------------------------------------------------
# Topic label assignment
# ---------------------------------------------------------------------------


class _FakePaper:
    def __init__(self, title: str):
        self.title = title


class TestAssignTopicLabels:
    def test_produces_one_label_per_cluster(self):
        X = np.eye(4)
        centroids = np.eye(4)
        assignments = np.array([0, 1, 2, 3])
        papers = [_FakePaper(f"p{i}") for i in range(4)]
        labels = assign_topic_labels(X, centroids, papers, assignments)
        assert len(labels) == 4

    def test_fallback_uses_closest_paper_title(self):
        """llm=None: each cluster label is the title of the member closest to
        that cluster's centroid."""
        X = np.array([
            [1.0, 0.0],
            [0.9, 0.1],
            [0.0, 1.0],
            [0.1, 0.9],
        ])
        centroids = np.array([[1.0, 0.0], [0.0, 1.0]])
        assignments = np.array([0, 0, 1, 1])
        papers = [_FakePaper("A"), _FakePaper("B"), _FakePaper("C"), _FakePaper("D")]
        labels = assign_topic_labels(X, centroids, papers, assignments)
        assert labels == ["A", "C"]

    def test_empty_cluster_gets_placeholder_label(self):
        X = np.eye(3)
        centroids = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])
        assignments = np.array([0, 1, 1])  # cluster 2 is empty
        papers = [_FakePaper("A"), _FakePaper("B"), _FakePaper("C")]
        labels = assign_topic_labels(X, centroids, papers, assignments)
        assert labels[2].startswith("Cluster")

    def test_delegates_to_llm_when_provided(self):
        calls = []

        class FakeLLM:
            def generate_cluster_label(self, titles):
                calls.append(list(titles))
                return "STUBBED"

        X = np.eye(3)
        centroids = np.eye(3)
        assignments = np.array([0, 1, 2])
        papers = [_FakePaper(f"p{i}") for i in range(3)]
        labels = assign_topic_labels(X, centroids, papers, assignments, llm=FakeLLM())
        assert labels == ["STUBBED", "STUBBED", "STUBBED"]
        assert len(calls) == 3
        for c in calls:
            assert len(c) == 1

    def test_llm_failure_falls_back_to_closest_title(self):
        class BrokenLLM:
            def generate_cluster_label(self, titles):
                raise RuntimeError("model not available")

        X = np.eye(2)
        centroids = np.eye(2)
        assignments = np.array([0, 1])
        papers = [_FakePaper("title-zero"), _FakePaper("title-one")]
        labels = assign_topic_labels(
            X, centroids, papers, assignments, llm=BrokenLLM()
        )
        assert labels == ["title-zero", "title-one"]

    def test_accepts_dict_papers(self):
        """Papers may also be dicts with a 'title' key."""
        X = np.eye(2)
        centroids = np.eye(2)
        assignments = np.array([0, 1])
        papers = [{"title": "A"}, {"title": "B"}]
        labels = assign_topic_labels(X, centroids, papers, assignments)
        assert labels == ["A", "B"]
