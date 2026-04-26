"""
cluster_stability.py — Quantify how reproducible config.N_CLUSTERS is.

Runs kmeans with the configured k across multiple seeds (each with the full
n_init=10 production setting), then computes pairwise ARI / NMI between
the resulting assignments. Stable clusterings have mean pairwise ARI near
1.0; noise-level clusterings drift toward 0.

Usage:
    python scripts/cluster_stability.py [seed1 seed2 ...]

Defaults to seeds = [42, 7, 123, 999, 2025].
"""

import json
import os
import sys
from itertools import combinations

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.clustering import kmeans
from scripts.sweep_n_clusters import ari, nmi


def main():
    seeds = [42, 7, 123, 999, 2025]
    if len(sys.argv) > 1:
        seeds = [int(s) for s in sys.argv[1:]]

    print(f"Loading abstracts from {config.EMBEDDINGS_DIR} ...")
    X = np.load(os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy"))
    print(f"  shape: {X.shape}")
    print(f"  k = {config.N_CLUSTERS}, n_init = 10, seeds = {seeds}")
    print()

    assignments: dict[int, np.ndarray] = {}
    inertias: dict[int, float] = {}
    for seed in seeds:
        print(f"  running kmeans seed={seed} ...", flush=True)
        _, asg, ine = kmeans(X, k=config.N_CLUSTERS, seed=seed, n_init=10)
        assignments[seed] = asg
        inertias[seed] = float(ine)
        sizes = sorted([int((asg == j).sum()) for j in range(config.N_CLUSTERS)])
        print(f"    inertia={ine:.3f}  size_range=[{sizes[0]}, {sizes[-1]}]")
    print()

    # Pairwise comparison matrices
    n = len(seeds)
    ari_mat = np.eye(n)
    nmi_mat = np.eye(n)
    for (i, s1), (j, s2) in combinations(enumerate(seeds), 2):
        a = ari(assignments[s1], assignments[s2])
        m = nmi(assignments[s1], assignments[s2])
        ari_mat[i, j] = ari_mat[j, i] = a
        nmi_mat[i, j] = nmi_mat[j, i] = m

    print(f"=== Pairwise ARI (off-diagonal) ===")
    print("seeds:    " + "  ".join(f"{s:>7d}" for s in seeds))
    for i, s1 in enumerate(seeds):
        row = "  ".join(
            "    -   " if i == j else f"{ari_mat[i,j]:>+7.4f}" for j in range(n)
        )
        print(f"  {s1:>5d}:  {row}")
    off_diag = ari_mat[np.triu_indices(n, k=1)]
    print(f"  mean ARI:  {off_diag.mean():.4f}  (std {off_diag.std():.4f})")
    print()

    print(f"=== Pairwise NMI (off-diagonal) ===")
    print("seeds:    " + "  ".join(f"{s:>7d}" for s in seeds))
    for i, s1 in enumerate(seeds):
        row = "  ".join(
            "    -   " if i == j else f"{nmi_mat[i,j]:>+7.4f}" for j in range(n)
        )
        print(f"  {s1:>5d}:  {row}")
    off_diag_nmi = nmi_mat[np.triu_indices(n, k=1)]
    print(f"  mean NMI:  {off_diag_nmi.mean():.4f}  (std {off_diag_nmi.std():.4f})")
    print()

    # Per-paper consistency: fraction of runs where each paper landed
    # with its modal cluster's most-common co-members
    from collections import Counter
    co_assign = np.zeros((X.shape[0],), dtype=np.float64)
    for i in range(X.shape[0]):
        # cluster id of paper i in each run; build a mapping seed→its cluster id
        my_clusters = {s: int(assignments[s][i]) for s in seeds}
        # For each pair of runs, check if paper i ends up co-assigned with
        # the same broad set. Cheaper proxy: just count its modal cluster.
        c = Counter(my_clusters.values()).most_common(1)[0][1]
        co_assign[i] = c / len(seeds)
    print(f"=== Per-paper modal-cluster fraction ===")
    print(f"  mean: {co_assign.mean():.3f}  (1.0 = always same id, "
          f"~1/k = random)")
    print(f"  papers with all-{n} runs identical: "
          f"{int((co_assign == 1.0).sum())} / {X.shape[0]} "
          f"({100 * (co_assign == 1.0).mean():.1f}%)")
    print()

    interp = "STABLE" if off_diag.mean() > 0.7 else (
        "MODERATE" if off_diag.mean() > 0.4 else "NOISY"
    )
    print(f"=== Verdict: {interp} (mean pairwise ARI = {off_diag.mean():.4f}) ===")
    print(f"   >0.7 = clusterings are essentially the same up to label permutation")
    print(f"   0.4–0.7 = stable backbone, some assignments drift")
    print(f"   <0.4 = the clustering is noise-dominated; k is not well-determined")

    out = {
        "k": config.N_CLUSTERS,
        "seeds": seeds,
        "inertias": inertias,
        "ari_matrix": ari_mat.tolist(),
        "nmi_matrix": nmi_mat.tolist(),
        "mean_ari": float(off_diag.mean()),
        "mean_nmi": float(off_diag_nmi.mean()),
        "modal_fraction_mean": float(co_assign.mean()),
        "always_identical_count": int((co_assign == 1.0).sum()),
        "n_papers": X.shape[0],
    }
    out_path = os.path.join(config.PROCESSED_DIR, "cluster_stability.json")
    with open(out_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
