"""
clustering.py — FROM-SCRATCH k-means clustering.

Implements k-means (Lloyd's algorithm) with k-means++ initialization using
only numpy. No sklearn, no scipy, no faiss.

Algorithm:
    1. Initialize k centroids via k-means++ (or uniform random).
    2. Assignment step: assign each point to the nearest centroid by squared
       Euclidean distance.
    3. Update step: recompute centroids as the mean of assigned points; reinit
       empty clusters; optionally renormalize (spherical variant).
    4. Repeat until assignments stop changing or max_iter is reached.
    5. Run n_init independent restarts; keep the partition with lowest inertia.

Also provides assign_topic_labels, which uses representative papers per cluster
to drive an external LLM (src.llm.generate_cluster_label) for human-readable
cluster names.
"""

import numpy as np


# ---------------------------------------------------------------------------
# Core kernels
# ---------------------------------------------------------------------------


def _pairwise_sq_distances(X: np.ndarray, C: np.ndarray) -> np.ndarray:
    """
    Squared Euclidean distances between every row of X and every row of C.

    Uses ||x - c||^2 = ||x||^2 + ||c||^2 - 2 * x . c to avoid materializing
    the (N, k, D) intermediate tensor.

    Args:
        X: Shape (N, D).
        C: Shape (k, D).

    Returns:
        Shape (N, k) — dists[i, j] = ||X[i] - C[j]||^2, clipped to non-negative.
    """
    x_sq = np.sum(X * X, axis=1, keepdims=True)    # (N, 1)
    c_sq = np.sum(C * C, axis=1)                   # (k,)
    dists = x_sq + c_sq - 2.0 * (X @ C.T)          # (N, k)
    # Clip negatives that arise from floating-point subtraction when
    # ||x - c||^2 is theoretically ~0 but numerically slightly below zero.
    np.maximum(dists, 0.0, out=dists)
    return dists


# ---------------------------------------------------------------------------
# Initialization strategies
# ---------------------------------------------------------------------------


def _kmeans_pp_init(X: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """
    k-means++ initialization.

    Picks the first centroid uniformly at random, then samples each subsequent
    centroid with probability proportional to its squared distance to the
    nearest already-chosen centroid. Produces well-spread seeds that converge
    faster and to lower inertia than uniform random init.
    """
    N = X.shape[0]
    first = int(rng.integers(N))
    centroids = [X[first]]

    for _ in range(k - 1):
        C = np.stack(centroids)                                # (c, D)
        sq_dists = _pairwise_sq_distances(X, C).min(axis=1)    # (N,)
        total = float(sq_dists.sum())
        if total == 0.0:
            # All points coincide with already-chosen centroids — uniform fallback.
            probs = np.full(N, 1.0 / N)
        else:
            probs = sq_dists / total
        next_idx = int(rng.choice(N, p=probs))
        centroids.append(X[next_idx])

    return np.stack(centroids)


def _random_init(X: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """Uniform-random init: pick k distinct points as centroids."""
    idx = rng.choice(X.shape[0], size=k, replace=False)
    return X[idx].copy()


# ---------------------------------------------------------------------------
# Single Lloyd's run
# ---------------------------------------------------------------------------


def _single_run(
    X: np.ndarray,
    k: int,
    max_iter: int,
    init: str,
    rng: np.random.Generator,
    spherical: bool,
) -> tuple[np.ndarray, np.ndarray, float]:
    """One Lloyd's run. Called n_init times by kmeans()."""
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
                # Empty cluster: reseed to the point farthest from any current centroid.
                far_idx = int(dists.min(axis=1).argmax())
                new_centroids[j] = X[far_idx]

        if spherical:
            norms = np.linalg.norm(new_centroids, axis=1, keepdims=True)
            safe = np.where(norms == 0.0, 1.0, norms)
            new_centroids = new_centroids / safe

        centroids = new_centroids
        prev_assignments = assignments

    # Final pass to make assignments consistent with the final centroids
    # (needed when the loop exits via max_iter rather than convergence).
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
    """
    Run k-means clustering on data matrix X.

    Multi-restart Lloyd's algorithm with k-means++ initialization. Each of the
    n_init runs returns a (centroids, assignments, inertia) triple; the triple
    with lowest inertia wins.

    Spherical variant (enabled by default) renormalizes centroids to unit
    length after each update step. This is the right default for L2-normalized
    input (e.g., sentence-transformer embeddings): Euclidean distance between
    unit vectors is monotonic in cosine distance, so keeping centroids on the
    unit sphere makes them directly cosine-comparable to input rows downstream.

    Args:
        X: Shape (N, D) — data points.
        k: Number of clusters. Must be in [1, N].
        max_iter: Max Lloyd's iterations per restart.
        seed: Master random seed. Fully deterministic across runs.
        n_init: Number of independent restarts to try.
        init: 'kmeans++' (default) or 'random'.
        spherical: If True, renormalize centroids to unit length after each
            update. Default True; appropriate for unit-normalized inputs.

    Returns:
        centroids:   Shape (k, D) — final centroids from the best run.
        assignments: Shape (N,)   — cluster index for each point.
        inertia:     float        — sum of squared distances to assigned centroid.
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
        # Deterministic child seed so each restart is independently reproducible.
        run_seed = int(master_rng.integers(0, 2**31 - 1))
        run_rng = np.random.default_rng(run_seed)
        centroids, assignments, inertia = _single_run(
            X, k, max_iter, init, run_rng, spherical
        )
        if inertia < best_inertia:
            best_inertia = inertia
            best_centroids = centroids
            best_assignments = assignments

    assert best_centroids is not None and best_assignments is not None
    return best_centroids, best_assignments, best_inertia


def assign_topic_labels(
    X: np.ndarray,
    centroids: np.ndarray,
    papers: list,
    assignments: np.ndarray,
    llm: object = None,
    top_n_titles: int = 5,
) -> list[str]:
    """
    Generate human-readable topic labels for each cluster.

    For each cluster j:
      1. Rank cluster members by distance to centroid j and take the
         top_n_titles closest papers.
      2. Collect their titles.
      3. Call `llm.generate_cluster_label(titles)` (typically a seq2seq model
         like flan-T5 wrapped in src.llm).

    When llm is None, falls back to the single closest paper's title. This
    keeps the module importable without transformers installed and yields
    deterministic labels for tests.

    Args:
        X:           Shape (N, D) — data used for clustering. Needed so we can
                     compute paper-to-centroid distances.
        centroids:   Shape (k, D) — cluster centroids from kmeans().
        papers:      List of length N. Each element may be a Paper dataclass
                     (with a .title attribute) or a dict with a 'title' key.
        assignments: Shape (N,)   — cluster assignments from kmeans().
        llm:         Optional object exposing generate_cluster_label(titles).
        top_n_titles: Representative titles per cluster fed to the LLM.

    Returns:
        List of k strings — one label per cluster, ordered by cluster index.
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

        member_vecs = X[member_indices]                  # (m, D)
        diffs = member_vecs - centroids[j]
        sq = np.einsum("ij,ij->i", diffs, diffs)         # (m,)
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
                # LLM failure should not take down the pipeline — fall back.
                labels.append(titles[0])

    return labels
