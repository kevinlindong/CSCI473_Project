"""
pca.py — FROM-SCRATCH PCA (Principal Component Analysis).

Implements PCA for dimensionality reduction using only numpy.
No sklearn.decomposition.PCA.

Algorithm:
1. Mean-center the data.
2. Compute the covariance matrix.
3. Find the top eigenvectors via eigendecomposition.
4. Project the data onto the top components.
"""

import numpy as np


def pca(X: np.ndarray, n_components: int = 2) -> np.ndarray:
    """
    Reduce dimensionality of X to n_components using PCA.

    Args:
        X: Shape (N, D) — data points.
        n_components: Number of dimensions to reduce to.

    Returns:
        Shape (N, n_components) — projected data.
    """
    raise NotImplementedError
