# ArXiv Research Assistant

A retrieval-augmented research tool that answers natural language questions
using a curated corpus of Arxiv papers, with an interactive topic map.

Built for CSCI-UA 473 (Fundamentals of Machine Learning) at NYU, Spring 2026.

## Features

- Natural language question answering over Arxiv papers with citations
- Three-tier retrieval: abstract → section chunks → figure captions
- From-scratch ML: cosine similarity search, k-means (Lloyd's + k-means++ + spherical variant), k-NN graph construction, Fruchterman-Reingold 3D layout
- **Interactive 3D topic graph** — force-directed k-NN layout, colored by k-means, labeled by a small instruction-tuned LLM (Qwen2.5-1.5B-Instruct, few-shot chat prompting)
- Editable cluster labels (localStorage in the UI, widget editor in the notebook)
- React + Vite + `react-force-graph-3d` frontend with FastAPI backend
- Self-contained Jupyter notebook for exploring the graph without running the web stack

## Quick Start

```bash
# Backend
pip install -r requirements.txt
uvicorn app:app --reload

# Frontend (in a separate terminal)
cd frontend
bun install
bun run dev
```

Open http://localhost:5173 in your browser. The Vite dev server proxies `/api` requests to the FastAPI backend on port 8000.

## Full Setup (from scratch)

```bash
# 1. Install backend dependencies
pip install -r requirements.txt

# 2. (Optional) Set up environment variables
cp .env.example .env
# Edit .env with your HuggingFace token if needed

# 3. Fetch papers from Arxiv
python scripts/fetch_papers.py

# 4. Build embedding matrices
python scripts/build_embeddings.py

# 5. Build the topic-graph artifact (k-means + k-NN + LLM labels)
python scripts/compute_topic_graph.py          # full pipeline with Qwen2.5-1.5B-Instruct (~3GB first-run download)
# python scripts/compute_topic_graph.py --no-llm   # fast iteration, closest-paper-title fallback

# 6. Start the backend
uvicorn app:app --reload

# 7. Start the frontend (in a separate terminal)
cd frontend
bun install     # or npm install
bun run dev
```

## Exploring via the notebook (no frontend required)

```bash
jupyter lab notebooks/topic_graph.ipynb
```

The notebook mirrors the full pipeline and renders the 3D topic graph as an interactive plotly scene — **rotate (drag), zoom (scroll), pan (right-drag), hover for paper titles, click legend to toggle clusters**. A separate widget cell lets you rename clusters and re-render live; an export cell writes the edits back to `data/processed/topic_graph.json`. The main 3D view and the k-sweep plot use regular `go.Figure`s so they render in any notebook viewer (GitHub, VS Code preview, nbviewer) without a live kernel.

## Project Structure

```
├── app.py                           # FastAPI backend server
├── config.py                        # Central configuration (N_CLUSTERS, KNN_NEIGHBORS, ...)
├── scripts/
│   ├── fetch_papers.py              # Download papers from Arxiv API
│   ├── build_embeddings.py          # Encode corpus into embedding spaces
│   └── compute_topic_graph.py       # k-means + k-NN + LLM labels → topic_graph.json
├── src/
│   ├── data.py                      # Parse raw Arxiv data into structured records
│   ├── encoder.py                   # Sentence-transformer encoding wrapper
│   ├── retrieval.py                 # From-scratch cosine similarity NN search
│   ├── clustering.py                # From-scratch k-means (Lloyd's + k-means++) + topic labeling
│   ├── graph.py                     # From-scratch symmetric k-NN graph construction
│   ├── pca.py                       # From-scratch PCA (stub, currently unused — see Why no PCA)
│   ├── reranker.py                  # Cross-encoder reranking fallback
│   ├── figures.py                   # CLIP-based figure encoding fallback
│   └── llm.py                       # Chat-LM generation (cluster labels + RAG answers)
├── frontend/                        # React + Vite app (Bun runtime)
│   ├── src/
│   │   ├── main.tsx                 # App shell + routes
│   │   ├── pages/
│   │   │   ├── PaperBrowse.tsx      # 2D design-study scatter (unchanged)
│   │   │   └── TopicGraph3D.tsx     # 3D WebGL force graph + editable legend
│   │   ├── hooks/
│   │   │   └── useClusterLabels.ts  # Merges server labels with localStorage overrides
│   │   └── ...
│   └── package.json                 # Adds react-force-graph-3d + three
├── data/
│   ├── raw/enriched/                # Raw arXiv JSON (one per paper)
│   ├── processed/
│   │   ├── papers.json              # Normalized Paper records
│   │   └── topic_graph.json         # Artifact served by /api/topic-map
│   └── embeddings/
│       ├── abstracts.npy            # (N, 768) L2-normalized
│       ├── chunks.npy, captions.npy
│       └── index.json               # Row-index → paper_id / metadata
├── tests/                           # pytest suites for from-scratch modules
└── notebooks/
    ├── exploration.ipynb            # Original embedding sanity checks
    └── topic_graph.ipynb            # End-to-end pipeline + interactive 3D view
```

## From-Scratch Algorithms

All pure NumPy, no sklearn / scipy / faiss. Style reference: `src/retrieval.py`.

- **Cosine Similarity Search** (`src/retrieval.py`): L2-normalized dot product + `np.argpartition` for O(N) top-k, with defensive zero-norm handling.
- **K-Means Clustering** (`src/clustering.py`): Lloyd's iteration with **k-means++ initialization**, empty-cluster reinit (reseed to farthest point), **n_init multi-restart** keeping best inertia, and a **spherical variant** that renormalizes centroids to the unit sphere after each update (the right default for L2-normalized sentence-transformer embeddings). Returns `(centroids, assignments, inertia)`.
- **k-NN Graph** (`src/graph.py`): Symmetric undirected graph over cosine similarity; edge weight = similarity; no self-loops. Used as the edge set for the 3D force-directed layout.
- **3D Fruchterman-Reingold Layout** (`notebooks/topic_graph.ipynb`): Pure-numpy force simulation (repulsion between all nodes, attraction along k-NN edges, cooling schedule) producing 3D coordinates for the matplotlib/plotly preview. The live frontend uses `react-force-graph-3d` for the same physics in WebGL.
- **Cluster Topic Labeling** (`src/clustering.py::assign_topic_labels` + `src/llm.py::generate_cluster_label`): Picks the 5 papers closest to each centroid and hands their titles to a small instruction-tuned causal LM (Qwen2.5-1.5B-Instruct by default) via a **3-shot chat prompt**. Swapping models is a one-line config change. Falls back to the nearest-paper title if the LLM is unavailable.
- **External Validation** (`notebooks/topic_graph.ipynb`): From-scratch Adjusted Rand Index (ARI) and Normalized Mutual Information (NMI) against arXiv `primary_category`, used to pick `k` rather than the noisy silhouette score.

## Topic Graph: design notes

### Why no PCA?

The original plan projected embeddings to 2D with PCA. On 768-d sentence-transformer output that threw away 93% of the variance (confirmed in `notebooks/exploration.ipynb`: 2 PCs ≈ 7% variance). Clusters smear, PC axes don't correspond to interpretable concepts, and the visualization becomes an atlas of noise. We swapped to a **force-directed k-NN graph** — no axes at all, interpretability lives in the edges ("these two are linked because they're mutual semantic neighbors in 768-d") and the k-means coloring.

### How `N_CLUSTERS` was chosen

Silhouette is uninformative on high-dimensional sentence-transformer embeddings — all values sit in the 0.03–0.08 range regardless of k. We swept k ∈ [4, 30] and picked **k=13** by external validation:

- **NMI against arXiv `primary_category`** climbs with k and plateaus around k=16–19 at NMI ≈ 0.36.
- **Singleton clusters emerge at k=14.** Past that, the cluster size distribution degenerates and silhouette spikes artificially because singletons have `a=0`.
- **k=13 is the largest non-degenerate k** with a clean min cluster size (9), NMI=0.344, ARI=0.085 — a real +0.035 NMI lift over k=5 without fragmenting.

Trace: see the `k sweep` cell at the bottom of `notebooks/topic_graph.ipynb` for the full inertia / silhouette / ARI / NMI table.

### Cluster labeling

We first tried `flan-T5-base` (250M params, seq2seq). Even with few-shot prompting it produced either single-word outputs or extractive copies of the first paper title (one cluster label came out as "Compressing Transformer Language Models via Matrix Product Operator Decomposition" — clearly just title 1). The labeler now uses `Qwen2.5-1.5B-Instruct` (a modern instruction-tuned causal LM) with a 3-shot chat prompt, which produces clean 2–5 word noun phrases ("weather forecasting", "transformer model compression", "federated learning", etc.). Swapping models is a one-line config change.

In rare cases two semantically-adjacent clusters may receive the same label (e.g. both RL sub-clusters → "reinforcement learning"). The labels are editable in the UI and in the notebook to handle these.

### Editable labels

The frontend stores overrides in `localStorage` under `cluster_labels_v1`; the `useClusterLabels` hook merges per-browser edits over the server-default labels and listens for cross-tab `storage` events. The notebook has a widget cell that edits the in-memory `labels` list and re-renders the 3D plot on button click; a follow-up export cell writes the edits back to `data/processed/topic_graph.json`.

## API

- `GET /api/topic-map` — returns the cached `data/processed/topic_graph.json` as JSON (`nodes`, `edges`, `clusters`, `meta`). Run `scripts/compute_topic_graph.py` to rebuild the artifact; the FastAPI process caches it module-level, so restart `uvicorn` to pick up changes.
- `POST /api/query`, `GET /api/papers`, `GET /api/papers/{id}` — stubs for the retrieval / RAG / catalog features.

## Team

- Vivek — Data Pipeline
- Xan/Ian — Retrieval System
- Kevin Dong — Clustering, Visualization & Frontend
- Kevin Pei — LLM Answer Generation & Integration

## License

MIT
