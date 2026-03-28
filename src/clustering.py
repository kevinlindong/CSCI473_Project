"""
clustering.py — FROM-SCRATCH k-means clustering.

Implements k-means clustering using only numpy. No sklearn.

Algorithm:
1. Initialize k centroids randomly from the data points.
2. Assignment step: assign each point to the nearest centroid.
3. Update step: recompute centroids as the mean of assigned points.
4. Repeat until convergence or max iterations.
"""

import numpy as np


def kmeans(
    X: np.ndarray,
    k: int,
    max_iter: int = 100,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run k-means clustering on data matrix X.

    Args:
        X: Shape (N, D) — data points.
        k: Number of clusters.
        max_iter: Maximum iterations.
        seed: Random seed for centroid initialization.

    Returns:
        centroids: Shape (k, D) — final cluster centroids.
        assignments: Shape (N,) — cluster index for each data point.
    """
    raise NotImplementedError


def assign_topic_labels(
    centroids: np.ndarray,
    papers: list,
    assignments: np.ndarray,
) -> list[str]:
    """
    Generate human-readable topic labels for each cluster.

    Uses the titles of papers closest to each centroid to derive a label.

    Args:
        centroids: Shape (k, D) — cluster centroids.
        papers: List of Paper objects with titles.
        assignments: Shape (N,) — cluster assignments.

    Returns:
        List of k topic label strings.
    """
    raise NotImplementedError
