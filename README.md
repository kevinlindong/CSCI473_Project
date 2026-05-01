# ArXiv Research Assistant

A retrieval-augmented research tool that answers natural language questions over a 10,000-paper ArXiv corpus, with an interactive 3D topic map.

Built for CSCI-UA 473 (Fundamentals of Machine Learning) at NYU, Spring 2026.

## Features

- Natural language question answering over a 10,000-paper ArXiv corpus with inline citations
- Three-tier retrieval: abstract → section chunks → figure captions, with cross-encoder reranking fallback
- Interactive 3D topic graph — UMAP layout, colored by k-means clusters (k=26), labeled by Qwen2.5-1.5B-Instruct
- Query Constellation — type a query to isolate the query node and its top-k semantic neighbors in the graph
- Scoot chat — a local Qwen-backed RAG assistant accessible from anywhere in the app
- Editable cluster labels (persisted in localStorage, editable in the notebook)
- React + Vite frontend with a custom Three.js renderer using InstancedMesh + LineSegments (~3 draw calls for 33k nodes/edges)

## Core Algorithms

All implemented from scratch using NumPy only — no sklearn, scipy, or faiss.

**Cosine Similarity Search** (`src/retrieval.py`)
Used to retrieve the top-k most relevant papers for a query. The query embedding is compared against all abstract embeddings using L2-normalized dot product. `np.argpartition` gives O(N) top-k selection without a full sort.

**K-Means Clustering** (`src/clustering.py`)
Used to group the 10,000-paper corpus into 26 topic clusters displayed in the 3D graph. Implements Lloyd's algorithm with k-means++ initialization, empty-cluster reinit (reseed to farthest point), n_init multi-restart keeping best inertia, and a spherical variant that renormalizes centroids to the unit sphere after each update — the correct default for L2-normalized sentence-transformer embeddings.

**K-NN Graph Construction** (`src/graph.py`)
Used to build the edge set for the 3D topic graph. Constructs a symmetric undirected graph over cosine similarity: each node is linked to its k most similar peers, edges are symmetrized, self-loops excluded, and edge weight is the cosine similarity of the pair.

**Cluster Topic Labeling** (`src/clustering.py`, `src/llm.py`)
Used to generate the human-readable cluster names shown in the legend. For each cluster, the 5 papers closest to the centroid are selected and their titles are passed to Qwen2.5-1.5B-Instruct via a 3-shot chat prompt. Falls back to the nearest paper's title if the LLM is unavailable.

**External Cluster Validation** (`scripts/sweep_n_clusters.py`, `notebooks/topic_graph.ipynb`)
Used to choose k=26. From-scratch Adjusted Rand Index (ARI) and Normalized Mutual Information (NMI) are computed against each paper's arXiv `primary_category` across a range of k values. Silhouette score is uninformative on high-dimensional sentence-transformer embeddings; ARI/NMI against ground-truth categories is used instead.

## File Structure

```
├── app.py                           # FastAPI backend
├── config.py                        # Central config (N_CLUSTERS, KNN_NEIGHBORS, ...)
├── requirements.txt
├── start.sh                         # Start backend + frontend together (dev)
├── start-prod.sh                    # Start with vite preview (prod build)
├── scripts/
│   ├── setup_data.sh                # Download pre-built data snapshot (~1.4 GB)
│   ├── fetch_papers.py              # Download papers from ArXiv API
│   ├── build_embeddings.py          # Encode corpus into embedding matrices
│   ├── build_papers_db.py           # Build SQLite paper store
│   ├── compute_topic_graph.py       # k-means + k-NN + UMAP-3D + LLM labels → topic_graph.json
│   ├── cluster_stability.py         # Bootstrap stability sweep over k
│   └── sweep_n_clusters.py          # External-validation k-sweep (NMI/ARI vs arXiv categories)
├── src/
│   ├── retrieval.py                 # From-scratch cosine similarity nearest-neighbor search
│   ├── clustering.py                # From-scratch k-means + topic labeling
│   ├── graph.py                     # From-scratch symmetric k-NN graph
│   ├── encoder.py                   # Sentence-transformer encoding
│   ├── reranker.py                  # Cross-encoder reranking fallback
│   ├── llm.py                       # LLM generation (cluster labels, RAG answers, chat)
│   ├── papers_db.py                 # SQLite paper store + LRU-cached lookup
│   └── data.py                      # Parse raw ArXiv JSON into structured records
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── PaperBrowse.tsx      # Corpus map + Query Constellation + catalogue
│   │   │   └── TopicGraph3D.tsx     # 3D topic-graph view with editable legend
│   │   ├── components/
│   │   │   ├── CustomGraph3D.tsx    # Three.js renderer (InstancedMesh + LineSegments)
│   │   │   ├── CorpusGraph3D.tsx    # CustomGraph3D wrapper for the corpus map
│   │   │   └── ScootChat.tsx        # Floating Qwen chat assistant
│   │   └── hooks/
│   │       └── useClusterLabels.ts  # Server labels + localStorage overrides
│   └── package.json
├── data/
│   ├── embeddings/
│   │   ├── abstracts.npy            # (N, 768) L2-normalized abstract embeddings
│   │   ├── chunks.npy               # Section-chunk embeddings
│   │   ├── captions.npy             # Figure caption embeddings
│   │   └── index.json               # Row index → paper_id / metadata
│   ├── processed/
│   │   ├── topic_graph.json         # Precomputed 3D layout, clusters, labels
│   │   ├── cluster_stability.json
│   │   └── sweep_n_clusters.json
│   └── papers.db                    # SQLite paper metadata store
├── notebooks/
│   ├── topic_graph.ipynb            # Full pipeline + k-sweep + interactive 3D view
│   ├── retrieval.ipynb
│   ├── reranking.ipynb
│   └── query_distance_analysis.ipynb
└── tests/
```

## Running on a Clean Environment

### Quick start (pre-built data, ~2 min)

Requires: Python 3.9+, Node.js, `curl`, `tar`, `zstd`, `jq`

```bash
git clone https://github.com/kevinlindong/CSCI473_Project.git
cd CSCI473_Project

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

./scripts/setup_data.sh   # downloads ~1.4 GB data snapshot

./start.sh                # backend on :3001, frontend on :5173
```

Open http://localhost:5173. The Vite dev server proxies `/api/*` to the FastAPI backend.

**First query will be slow** (~30–60s) while sentence-transformer and Qwen models download (~3.5 GB total). Subsequent queries are fast.

### Environment variables (optional)

Copy `.env.example` to `.env`. Defaults work out of the box with local Qwen inference.

| Variable           | Default | Description                                                        |
|--------------------|---------|--------------------------------------------------------------------|
| `LLM_PROVIDER`     | `local` | `local` uses Qwen2.5-1.5B on-device; `openrouter` uses remote API |
| `OPENROUTER_API_KEY` | —     | Required only if `LLM_PROVIDER=openrouter`                         |
| `ENABLE_LLM`       | `1`     | Set to `0` for retrieval-only mode (no LLM synthesis)              |

### Full rebuild from scratch (~7 hr)

Use this to regenerate the corpus and embeddings rather than downloading the snapshot.

```bash
python scripts/fetch_papers.py        # fetch ~10k papers from ArXiv (~30 min)
python scripts/build_embeddings.py    # encode corpus (~2–3 hr, GPU recommended)
python scripts/build_papers_db.py     # build SQLite store (~5 min)
python scripts/compute_topic_graph.py # k-means + k-NN + UMAP + LLM labels (~1–2 hr)
./start.sh
```

### Notebook exploration (no frontend required)

```bash
jupyter lab notebooks/topic_graph.ipynb
```
