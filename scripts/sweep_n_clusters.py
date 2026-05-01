"""NMI/ARI/min-size sweep to pick N_CLUSTERS, scored against arXiv primary_category."""

import json
import os
import sys
from math import log

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.clustering import kmeans


def _contingency(a, b):
    # searchsorted on sorted uniques is O(N log K) numpy vs. an O(N) Python dict-lookup loop.
    ca, cb = np.unique(a), np.unique(b)
    ai = np.searchsorted(ca, a)
    bi = np.searchsorted(cb, b)
    M = np.zeros((len(ca), len(cb)), dtype=np.int64)
    np.add.at(M, (ai, bi), 1)
    return M


def _c2(x):
    return x * (x - 1) // 2


def ari(a, b):
    M = _contingency(a, b)
    n = M.sum()
    s_ij = sum(_c2(int(v)) for v in M.flatten())
    s_a = sum(_c2(int(v)) for v in M.sum(axis=1))
    s_b = sum(_c2(int(v)) for v in M.sum(axis=0))
    exp = s_a * s_b / _c2(n)
    mx = 0.5 * (s_a + s_b)
    return 0.0 if mx == exp else (s_ij - exp) / (mx - exp)


def nmi(a, b):
    M = _contingency(a, b).astype(np.float64)
    n = M.sum()
    P = M / n
    pa = P.sum(axis=1)
    pb = P.sum(axis=0)
    mi = 0.0
    for i in range(P.shape[0]):
        for j in range(P.shape[1]):
            if P[i, j] > 0 and pa[i] > 0 and pb[j] > 0:
                mi += P[i, j] * log(P[i, j] / (pa[i] * pb[j]))
    h_a = -sum(p * log(p) for p in pa if p > 0)
    h_b = -sum(p * log(p) for p in pb if p > 0)
    denom = 0.5 * (h_a + h_b)
    return 0.0 if denom == 0 else mi / denom


def main():
    k_min, k_max, k_step = 10, 50, 2
    if len(sys.argv) == 4:
        k_min, k_max, k_step = (int(x) for x in sys.argv[1:])

    print(f"Loading embeddings + index from {config.EMBEDDINGS_DIR} ...")
    abstracts = np.load(os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy"))
    with open(os.path.join(config.EMBEDDINGS_DIR, "index.json")) as f:
        index = json.load(f)
    abstract_ids = index["abstracts"]
    print(f"  abstracts: {abstracts.shape}, ids: {len(abstract_ids)}")

    print("Loading primary_category labels from raw/enriched ...")
    primary = {}
    for fn in os.listdir(config.RAW_DIR):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(config.RAW_DIR, fn)) as f:
            p = json.load(f)
        primary[p["paper_id"]] = p.get("primary_category", "")
    pri_labels = [primary.get(pid, "") for pid in abstract_ids]
    pri_to_int = {c: i for i, c in enumerate(sorted(set(pri_labels)))}
    pri_int = np.array([pri_to_int[c] for c in pri_labels])
    print(f"  unique categories: {len(pri_to_int)}: {sorted(pri_to_int)}")

    k_values = list(range(k_min, k_max + 1, k_step))
    print(f"\nSweeping k ∈ {k_values} (n_init=3 for speed)...")
    print(f"{'k':>3}  {'inertia':>9}  {'ARI':>7}  {'NMI':>6}  {'min':>5}  note")

    results = []
    for k in k_values:
        _, asg, ine = kmeans(
            abstracts, k=k, seed=config.KMEANS_SEED, n_init=3
        )
        a = ari(asg, pri_int)
        n = nmi(asg, pri_int)
        min_size = min(int((asg == j).sum()) for j in range(k))
        note = "singleton!" if min_size <= 2 else ""
        print(f"{k:>3}  {ine:>9.3f}  {a:>+7.4f}  {n:>6.4f}  {min_size:>5d}  {note}")
        results.append(
            {"k": k, "inertia": ine, "ari": a, "nmi": n, "min_size": min_size}
        )

    out = os.path.join(config.PROCESSED_DIR, "sweep_n_clusters.json")
    os.makedirs(config.PROCESSED_DIR, exist_ok=True)
    with open(out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {out}")

    floor = 10
    eligible = [r for r in results if r["min_size"] > floor]
    if eligible:
        best = max(eligible, key=lambda r: r["nmi"])
        print(
            f"\nRecommended N_CLUSTERS = {best['k']} "
            f"(NMI={best['nmi']:.4f}, ARI={best['ari']:+.4f}, "
            f"min_size={best['min_size']}, floor={floor})"
        )
    else:
        print(f"\nNo k passed min_size>{floor}; loosen the floor or widen k range.")


if __name__ == "__main__":
    main()
