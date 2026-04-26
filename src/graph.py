"""
graph.py — FROM-SCRATCH k-NN graph construction over cosine similarity.

Given a matrix of row embeddings X, build an undirected k-nearest-neighbors
graph where each node i is linked to its k most cosine-similar peers. Edges
are symmetrized: (i, j) appears if j is among the top-k of i OR i is among
the top-k of j. Self-loops are excluded. Edge weight is the cosine similarity
of the pair (max of both directions when both are present).

Reuses src.retrieval.cosine_similarity so the similarity semantics match the
rest of the app's retrieval pipeline.
"""

import numpy as np

from src.retrieval import cosine_similarity


def knn_graph(
    X: np.ndarray,
    k_neighbors: int = 8,
) -> list[tuple[int, int, float]]:
    """
    Build a symmetric k-NN graph from cosine similarity.

    Args:
        X: Shape (N, D) — row embeddings. Rows need not be unit-normalized;
           cosine_similarity handles normalization internally.
        k_neighbors: Number of nearest neighbors per node (self excluded).
                     Clamped to N-1 when larger.

    Returns:
        A list of unique undirected edges as (i, j, weight) tuples with i < j.
        weight is the cosine similarity between rows i and j (in [-1, 1]).
    """
    X = np.asarray(X)
    if X.ndim != 2:
        raise ValueError(f"X must be 2D, got shape {X.shape}")
    N = X.shape[0]
    if N < 2:
        return []

    k = min(k_neighbors, N - 1)
    if k <= 0:
        return []

    sim_matrix = X @ X.T
    norms = np.linalg.norm(X, axis=1)
    safe = np.where(norms == 0.0, 1.0, norms)
    sim_matrix = sim_matrix / safe[:, None] / safe[None, :]
    # Zero-norm rows get 0 similarity everywhere rather than NaN.
    zero = norms == 0.0
    if zero.any():
        sim_matrix[zero, :] = 0.0
        sim_matrix[:, zero] = 0.0

    # Mask self-similarity so argpartition never picks i itself as its own neighbor.
    np.fill_diagonal(sim_matrix, -np.inf)

    # For each row i, the top-k column indices by similarity. O(N^2) memory
    # at N=10k is ~400 MB float32 — still fits comfortably; argpartition
    # is O(N) per row, so total work is O(N^2). Past ~30k swap for an
    # ANN-backed neighbor query (FAISS / hnswlib).
    top_unsorted = np.argpartition(-sim_matrix, kth=k - 1, axis=1)[:, :k]  # (N, k)

    # Collapse directed (i -> j) and (j -> i) into one undirected entry per
    # pair, keeping the larger similarity if both directions nominated it.
    edges: dict[tuple[int, int], float] = {}
    for i in range(N):
        for j in top_unsorted[i]:
            j = int(j)
            if j == i:
                continue
            a, b = (i, j) if i < j else (j, i)
            w = float(sim_matrix[i, j])
            if (a, b) not in edges or w > edges[(a, b)]:
                edges[(a, b)] = w

    return [(a, b, w) for (a, b), w in edges.items()]


def knn_graph_via_retrieval(
    X: np.ndarray,
    k_neighbors: int = 8,
) -> list[tuple[int, int, float]]:
    """
    Alternative implementation that goes row-by-row through cosine_similarity
    from src.retrieval. Slower for large N but useful for tests that want to
    exercise the exact same code path as retrieval.

    Same contract as knn_graph().
    """
    X = np.asarray(X)
    if X.ndim != 2:
        raise ValueError(f"X must be 2D, got shape {X.shape}")
    N = X.shape[0]
    if N < 2:
        return []

    k = min(k_neighbors, N - 1)
    if k <= 0:
        return []

    edges: dict[tuple[int, int], float] = {}
    for i in range(N):
        sims = cosine_similarity(X[i], X).copy()  # (N,)
        sims[i] = -np.inf                         # exclude self
        top_unsorted = np.argpartition(-sims, kth=k - 1)[:k]
        for j in top_unsorted:
            j = int(j)
            if j == i:
                continue
            a, b = (i, j) if i < j else (j, i)
            w = float(sims[j])
            if (a, b) not in edges or w > edges[(a, b)]:
                edges[(a, b)] = w

    return [(a, b, w) for (a, b), w in edges.items()]
