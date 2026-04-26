# ArXiv Research Assistant

A retrieval-augmented research tool that answers natural language questions
using a curated corpus of Arxiv papers, with an interactive topic map.

Built for CSCI-UA 473 (Fundamentals of Machine Learning) at NYU, Spring 2026.

## Features

- Natural language question answering over a 10,000-paper Arxiv corpus with citations
- Three-tier retrieval: abstract → section chunks → figure captions, with cross-encoder reranking fallback
- From-scratch ML: cosine similarity search, k-means (Lloyd's + k-means++ + spherical variant), k-NN graph construction
- **Interactive 3D topic graph** at 10k+20k node/edge scale — UMAP layout, colored by k-means (k=26), labeled by a small instruction-tuned LLM (Qwen2.5-1.5B-Instruct, few-shot chat prompting)
- **Query Constellation filter** — type a query, isolate the virtual query node + its top-k semantic neighbors against the rest of the cloud
- **Scoot chat** — local Qwen-backed RAG assistant (`/api/scoot`) accessible from anywhere in the app
- Editable cluster labels (localStorage in the UI, widget editor in the notebook)
- React + Vite frontend with a custom Three.js renderer (`CustomGraph3D`) — InstancedMesh + LineSegments collapse ~33k draw calls into ~3 to keep 60fps on integrated GPUs
- Self-contained Jupyter notebook for exploring the graph without running the web stack

## Quick Start (teammate setup, ~2 min)

Pulls a pre-built data snapshot from GitHub Releases — saves ~7 hr of regeneration.

```bash
git clone https://github.com/kevinlindong/CSCI473_Project.git
cd CSCI473_Project
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/setup_data.sh        # downloads ~1.4 GB tarball, extracts to data/
./start.sh                     # FastAPI on :3001, Vite on :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api` requests to the FastAPI backend on port 3001.

## Full Setup (from scratch, ~7 hr)

Use this if you want to regenerate the corpus instead of downloading the snapshot.

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

# 5. Build the SQLite paper store (used by app.py for fast metadata lookup)
python scripts/build_papers_db.py

# 6. Build the topic-graph artifact (k-means + k-NN + LLM labels)
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
├── start.sh                         # Run backend + frontend together (dev)
├── start-prod.sh                    # Same, but vite preview (prod-bundled)
├── scripts/
│   ├── fetch_papers.py              # Download papers from Arxiv API
│   ├── build_embeddings.py          # Encode corpus into embedding spaces
│   ├── build_papers_db.py           # Build SQLite store for paper metadata
│   ├── compute_topic_graph.py       # k-means + k-NN + UMAP-3D + LLM labels → topic_graph.json
│   ├── cluster_stability.py         # Bootstrap stability sweep over k
│   ├── sweep_n_clusters.py          # External-validation k-sweep (NMI vs arXiv categories)
│   └── setup_data.sh                # End-to-end data pipeline runner
├── src/
│   ├── data.py                      # Parse raw Arxiv data into structured records
│   ├── encoder.py                   # Sentence-transformer encoding wrapper
│   ├── retrieval.py                 # From-scratch cosine similarity NN search
│   ├── clustering.py                # From-scratch k-means (Lloyd's + k-means++) + topic labeling
│   ├── graph.py                     # From-scratch symmetric k-NN graph construction
│   ├── pca.py                       # From-scratch PCA (paper-only — UMAP took its place at runtime)
│   ├── reranker.py                  # Cross-encoder reranking fallback
│   ├── figures.py                   # CLIP-based figure encoding fallback (stub)
│   ├── papers_db.py                 # SQLite paper store + LRU-cached lookup
│   └── llm.py                       # Chat-LM generation (cluster labels, RAG answers, scoot chat)
├── frontend/                        # React + Vite app
│   ├── src/
│   │   ├── main.tsx                 # App shell + routes
│   │   ├── pages/
│   │   │   ├── PaperBrowse.tsx      # Corpus map + Query Constellation + catalogue
│   │   │   └── TopicGraph3D.tsx     # 3D topic-graph view with editable legend
│   │   ├── components/
│   │   │   ├── CustomGraph3D.tsx    # Direct Three.js renderer (InstancedMesh + LineSegments)
│   │   │   ├── CorpusGraph3D.tsx    # CustomGraph3D wrapper for the corpus map
│   │   │   └── ScootChat.tsx        # Floating Qwen chat assistant
│   │   ├── hooks/
│   │   │   ├── useClusterLabels.ts  # Server labels + localStorage overrides
│   │   │   └── useAmbientDrift.ts   # Subtle node drift animation
│   │   └── lib/
│   │       └── topicGraphCache.ts   # Stale-while-revalidate cache for /api/topic-map
│   └── package.json                 # Three.js
├── data/
│   ├── raw/enriched/                # Raw arXiv JSON (one per paper)
│   ├── processed/
│   │   ├── topic_graph.json         # Artifact served by /api/topic-map
│   │   ├── cluster_stability.json   # Bootstrap k-stability scores
│   │   └── sweep_n_clusters.json    # NMI/ARI vs arXiv categories per k
│   ├── papers.db                    # SQLite paper store
│   └── embeddings/
│       ├── abstracts.npy            # (N, 768) L2-normalized
│       ├── chunks.npy, captions.npy
│       └── index.json               # Row-index → paper_id / metadata
├── tests/                           # pytest suites for from-scratch modules
└── notebooks/
    ├── exploration.ipynb            # Original embedding sanity checks
    ├── retrieval.ipynb              # Retrieval sanity check on the live corpus
    ├── reranking.ipynb              # Cross-encoder reranker fallback demo
    ├── topic_graph.ipynb            # End-to-end pipeline + k-sweep + interactive 3D view
    └── query_distance_analysis.ipynb  # Quantifies query→cluster distances in embedding + UMAP space
```

## From-Scratch Algorithms

All pure NumPy, no sklearn / scipy / faiss. Style reference: `src/retrieval.py`.

- **Cosine Similarity Search** (`src/retrieval.py`): L2-normalized dot product + `np.argpartition` for O(N) top-k, with defensive zero-norm handling.
- **K-Means Clustering** (`src/clustering.py`): Lloyd's iteration with **k-means++ initialization**, empty-cluster reinit (reseed to farthest point), **n_init multi-restart** keeping best inertia, and a **spherical variant** that renormalizes centroids to the unit sphere after each update (the right default for L2-normalized sentence-transformer embeddings). Returns `(centroids, assignments, inertia)`.
- **k-NN Graph** (`src/graph.py`): Symmetric undirected graph over cosine similarity; edge weight = similarity; no self-loops. Used as the edge set for the 3D layout.
- **3D Fruchterman-Reingold Layout** (`notebooks/topic_graph.ipynb`): Pure-numpy force simulation (repulsion between all nodes, attraction along k-NN edges, cooling schedule). Kept in the notebook as the from-scratch reference implementation; the live runtime uses UMAP 3D (via `umap-learn`) precomputed offline in `scripts/compute_topic_graph.py` because force simulation doesn't scale to 10k nodes interactively.
- **Cluster Topic Labeling** (`src/clustering.py::assign_topic_labels` + `src/llm.py::generate_cluster_label`): Picks the 5 papers closest to each centroid and hands their titles to a small instruction-tuned causal LM (Qwen2.5-1.5B-Instruct by default) via a **3-shot chat prompt**. Swapping models is a one-line config change. Falls back to the nearest-paper title if the LLM is unavailable.
- **External Validation** (`notebooks/topic_graph.ipynb`): From-scratch Adjusted Rand Index (ARI) and Normalized Mutual Information (NMI) against arXiv `primary_category`, used to pick `k` rather than the noisy silhouette score.

## Topic Graph: design notes

### Why no PCA?

The original plan projected embeddings to 2D with PCA. On 768-d sentence-transformer output that threw away 93% of the variance (confirmed in `notebooks/exploration.ipynb`: 2 PCs ≈ 7% variance). Clusters smear, PC axes don't correspond to interpretable concepts, and the visualization becomes an atlas of noise. We swapped to a **force-directed k-NN graph** — no axes at all, interpretability lives in the edges ("these two are linked because they're mutual semantic neighbors in 768-d") and the k-means coloring.

### How `N_CLUSTERS` was chosen

Silhouette is uninformative on high-dimensional sentence-transformer embeddings — all values sit in a narrow band regardless of k. The chosen k is the result of two complementary sweeps over the 10k corpus:

- **External validation** (`scripts/sweep_n_clusters.py` → `data/processed/sweep_n_clusters.json`): NMI / ARI of the cluster assignment against each paper's arXiv `primary_category`. Persisted so the choice is reproducible from data, not hand-tuned.
- **Bootstrap stability** (`scripts/cluster_stability.py` → `data/processed/cluster_stability.json`): adjusted Rand index between full-corpus assignments and assignments fit on bootstrap subsamples. Penalizes k values where small data perturbations cause clusters to dissolve.

Current setting: **`N_CLUSTERS = 26`** in `config.py`. Trace: see the k-sweep cell at the bottom of `notebooks/topic_graph.ipynb` for the full inertia / silhouette / ARI / NMI table.

### Cluster labeling

We first tried `flan-T5-base` (250M params, seq2seq). Even with few-shot prompting it produced either single-word outputs or extractive copies of the first paper title (one cluster label came out as "Compressing Transformer Language Models via Matrix Product Operator Decomposition" — clearly just title 1). The labeler now uses `Qwen2.5-1.5B-Instruct` (a modern instruction-tuned causal LM) with a 3-shot chat prompt, which produces clean 2–5 word noun phrases ("weather forecasting", "transformer model compression", "federated learning", etc.). Swapping models is a one-line config change.

In rare cases two semantically-adjacent clusters may receive the same label (e.g. both RL sub-clusters → "reinforcement learning"). The labels are editable in the UI and in the notebook to handle these.

### Editable labels

The frontend stores overrides in `localStorage` under `cluster_labels_v1`; the `useClusterLabels` hook merges per-browser edits over the server-default labels and listens for cross-tab `storage` events. The notebook has a widget cell that edits the in-memory `labels` list and re-renders the 3D plot on button click; a follow-up export cell writes the edits back to `data/processed/topic_graph.json`.

## API

- `GET /api/topic-map` — returns the cached `data/processed/topic_graph.json` as JSON (`nodes`, `edges`, `clusters`, `meta`). Run `scripts/compute_topic_graph.py` to rebuild the artifact; gzipped on the wire (~7 MB → ~2 MB) and module-level cached, so restart `uvicorn` to pick up changes.
- `GET /api/query-projection?q=...&k=8` — encodes the query and returns its top-k nearest abstracts (paper_id + similarity) plus the dominant cluster among them. Backs the corpus-map's query node + Query Constellation feature.
- `POST /api/query` — RAG answer over the corpus with citations; runs the bi-encoder retriever, falls back to the cross-encoder reranker on weak/bunched scores, and synthesizes the answer with Qwen2.5-1.5B-Instruct.
- `POST /api/scoot` — chat replies from the local Qwen model with the scoot system prompt; used by `ScootChat`.
- `GET /api/papers`, `GET /api/papers/{id}` — paper summaries / detail, served from `data/papers.db` via an LRU cache.

## Team

- Vivek — Data Pipeline
- Xan/Ian — Retrieval System
- Kevin Dong — Clustering, Visualization & Frontend
- Kevin Pei — LLM Answer Generation & Integration

## License

MIT
