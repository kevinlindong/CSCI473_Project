"""From-scratch symmetric k-NN graph over cosine similarity."""

import numpy as np

from src.retrieval import cosine_similarity


def _add_edges(edges: dict, i: int, neighbor_indices, sims_row: np.ndarray) -> None:
    """Insert or update undirected edges for all neighbors of node i."""
    for j in neighbor_indices:
        j = int(j)
        if j == i:
            continue
        a, b = (i, j) if i < j else (j, i)
        w = float(sims_row[j])
        if (a, b) not in edges or w > edges[(a, b)]:
            edges[(a, b)] = w


def knn_graph(
    X: np.ndarray,
    k_neighbors: int = 8,
) -> list[tuple[int, int, float]]:
    """Symmetric k-NN graph: edge (i, j) if j ∈ topk(i) OR i ∈ topk(j).

    Returns list of (i, j, weight) with i < j; weight is cosine similarity.
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
    zero = norms == 0.0
    if zero.any():
        sim_matrix[zero, :] = 0.0
        sim_matrix[:, zero] = 0.0

    np.fill_diagonal(sim_matrix, -np.inf)

    top_unsorted = np.argpartition(-sim_matrix, kth=k - 1, axis=1)[:, :k]

    edges: dict[tuple[int, int], float] = {}
    for i in range(N):
        _add_edges(edges, i, top_unsorted[i], sim_matrix[i])

    return [(a, b, w) for (a, b), w in edges.items()]


def knn_graph_via_retrieval(
    X: np.ndarray,
    k_neighbors: int = 8,
) -> list[tuple[int, int, float]]:
    """Same contract as knn_graph(). Goes row-by-row through cosine_similarity
    so tests can exercise the same code path as retrieval.
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
        sims = cosine_similarity(X[i], X).copy()
        sims[i] = -np.inf
        top_unsorted = np.argpartition(-sims, kth=k - 1)[:k]
        _add_edges(edges, i, top_unsorted, sims)

    return [(a, b, w) for (a, b), w in edges.items()]
