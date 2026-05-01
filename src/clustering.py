"""From-scratch k-means with k-means++ init and topic labeling.

Pure numpy. No sklearn / scipy / faiss.
"""

from typing import Protocol

import numpy as np


class LLMLabeler(Protocol):
    def generate_cluster_label(self, titles: list[str]) -> str: ...


# ---------------------------------------------------------------------------
# Core kernels
# ---------------------------------------------------------------------------


def _pairwise_sq_distances(X: np.ndarray, C: np.ndarray) -> np.ndarray:
    """Squared Euclidean distances between every row of X and every row of C.

    Uses ||x - c||^2 = ||x||^2 + ||c||^2 - 2 x . c to avoid an (N, k, D) tensor.
    """
    x_sq = np.sum(X * X, axis=1, keepdims=True)
    c_sq = np.sum(C * C, axis=1)
    dists = x_sq + c_sq - 2.0 * (X @ C.T)
    # Float subtraction can drive ||x - c||^2 slightly below 0 for coincident points.
    np.maximum(dists, 0.0, out=dists)
    return dists


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


def _kmeans_pp_init(X: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """k-means++: each next centroid sampled with probability ∝ squared distance to its nearest already-chosen centroid."""
    N = X.shape[0]
    first = int(rng.integers(N))
    centroids = [X[first]]

    for _ in range(k - 1):
        C = np.stack(centroids)
        sq_dists = _pairwise_sq_distances(X, C).min(axis=1)
        total = float(sq_dists.sum())
        if total == 0.0:
            probs = np.full(N, 1.0 / N)
        else:
            probs = sq_dists / total
        next_idx = int(rng.choice(N, p=probs))
        centroids.append(X[next_idx])

    return np.stack(centroids)


def _random_init(X: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    idx = rng.choice(X.shape[0], size=k, replace=False)
    return X[idx].copy()


# ---------------------------------------------------------------------------
# Lloyd's iteration
# ---------------------------------------------------------------------------


def _single_run(
    X: np.ndarray,
    k: int,
    max_iter: int,
    init: str,
    rng: np.random.Generator,
    spherical: bool,
) -> tuple[np.ndarray, np.ndarray, float]:
    if init == "kmeans++":
        centroids = _kmeans_pp_init(X, k, rng)
    elif init == "random":
        centroids = _random_init(X, k, rng)
    else:
        raise ValueError(f"init must be 'kmeans++' or 'random', got {init!r}")

    assignments = np.zeros(X.shape[0], dtype=np.int64)
    prev_assignments = None

    for _ in range(max_iter):
        dists = _pairwise_sq_distances(X, centroids)
        assignments = dists.argmin(axis=1)

        if prev_assignments is not None and np.array_equal(assignments, prev_assignments):
            break

        new_centroids = np.zeros_like(centroids)
        for j in range(k):
            mask = assignments == j
            if mask.any():
                new_centroids[j] = X[mask].mean(axis=0)
            else:
                # Empty cluster: reseed to the point farthest from any centroid.
                far_idx = int(dists.min(axis=1).argmax())
                new_centroids[j] = X[far_idx]

        if spherical:
            norms = np.linalg.norm(new_centroids, axis=1, keepdims=True)
            safe = np.where(norms == 0.0, 1.0, norms)
            new_centroids = new_centroids / safe

        centroids = new_centroids
        prev_assignments = assignments

    # Re-assign against the final centroids (loop may have exited via max_iter).
    final_dists = _pairwise_sq_distances(X, centroids)
    final_assignments = final_dists.argmin(axis=1)
    inertia = float(final_dists[np.arange(X.shape[0]), final_assignments].sum())
    return centroids, final_assignments, inertia


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def kmeans(
    X: np.ndarray,
    k: int,
    max_iter: int = 100,
    seed: int = 42,
    n_init: int = 10,
    init: str = "kmeans++",
    spherical: bool = True,
) -> tuple[np.ndarray, np.ndarray, float]:
    """Multi-restart Lloyd's k-means.

    spherical=True renormalizes centroids to unit length after each update —
    correct default for L2-normalized embeddings (Euclidean distance between
    unit vectors is monotonic in cosine distance).

    Returns (centroids, assignments, inertia) for the best of n_init runs.
    """
    X = np.asarray(X)
    if X.ndim != 2:
        raise ValueError(f"X must be 2D, got shape {X.shape}")
    N = X.shape[0]
    if k <= 0 or k > N:
        raise ValueError(f"k={k} must be in [1, N={N}]")
    if n_init < 1:
        raise ValueError(f"n_init must be >= 1, got {n_init}")

    master_rng = np.random.default_rng(seed)

    best_inertia = np.inf
    best_centroids: np.ndarray | None = None
    best_assignments: np.ndarray | None = None

    for _ in range(n_init):
        run_seed = int(master_rng.integers(0, 2**31 - 1))
        run_rng = np.random.default_rng(run_seed)
        centroids, assignments, inertia = _single_run(
            X, k, max_iter, init, run_rng, spherical
        )
        if inertia < best_inertia:
            best_inertia = inertia
            best_centroids = centroids
            best_assignments = assignments

    if best_centroids is None or best_assignments is None:
        raise ValueError("k-means failed to converge in any of the n_init runs")
    return best_centroids, best_assignments, best_inertia


def assign_topic_labels(
    X: np.ndarray,
    centroids: np.ndarray,
    papers: list,
    assignments: np.ndarray,
    llm: "LLMLabeler | None" = None,
    top_n_titles: int = 5,
) -> list[str]:
    """Generate a topic label per cluster from its top_n_titles closest papers.

    Falls back to the closest paper's title when llm is None or the call raises.
    """
    k = centroids.shape[0]
    labels: list[str] = []

    def _title(paper) -> str:
        if isinstance(paper, dict):
            return paper.get("title", "")
        return getattr(paper, "title", "")

    for j in range(k):
        member_indices = np.where(assignments == j)[0]
        if len(member_indices) == 0:
            labels.append(f"Cluster {j}")
            continue

        member_vecs = X[member_indices]
        diffs = member_vecs - centroids[j]
        sq = np.einsum("ij,ij->i", diffs, diffs)
        order = np.argsort(sq)
        pick = order[: min(top_n_titles, len(order))]

        titles = [_title(papers[int(member_indices[p])]) for p in pick]
        titles = [t for t in titles if t]

        if not titles:
            labels.append(f"Cluster {j}")
            continue

        if llm is None:
            labels.append(titles[0])
        else:
            try:
                labels.append(llm.generate_cluster_label(titles))
            except Exception:
                labels.append(titles[0])

    return labels
