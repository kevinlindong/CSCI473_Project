# Scholar

A retrieval-augmented research tool that answers natural language questions over a 10,000-paper ArXiv corpus, with an interactive 3D topic map and an AI-powered LaTeX writing assistant.

## Features

- **Natural language Q&A** over a 10,000-paper ArXiv corpus with inline citations and passage excerpts
- **Three-tier retrieval**: abstract → section chunks → figure captions, with cross-encoder reranking fallback when abstract-level confidence is low
- **Interactive 3D topic graph** — UMAP-projected paper nodes colored by k-means clusters (k=26), labeled by Qwen2.5-1.5B-Instruct; rotate, zoom, and hover to explore
- **Query Constellation** — type a query to isolate the virtual query node and its top-k semantic neighbors against the rest of the cloud
- **Live LaTeX editor** — split-pane editor (source left, rendered preview right) that compiles and re-renders as you type, no reload required; supports equations (KaTeX), figures, citations, sections, and 12 one-click insert snippets
- **Scoot** — a floating AI writing assistant (Claude Haiku via OpenRouter) that operates across every page without interrupting the view behind it; Scoot can open an existing draft, create a new `.tex` file, write and insert LaTeX blocks directly into the editor at a specified position, and render the result live — all from natural language
- **Paper library** — save papers from the corpus to a personal shelf; import and manage `.tex` drafts

## Core Algorithms

All implemented from scratch using NumPy only — no sklearn, scipy, or faiss.

**Cosine Similarity Search** (`src/retrieval.py`)
Used to retrieve the top-k most relevant papers for a query. The query embedding is compared against all abstract embeddings using L2-normalized dot product. `np.argpartition` gives O(N) top-k selection without a full sort. Also used per-paper to rank section chunks and figure captions within the retrieval results.

**K-Means Clustering** (`src/clustering.py`)
Used to group the 10,000-paper corpus into 26 topic clusters displayed in the 3D graph. Implements Lloyd's algorithm with k-means++ initialization, empty-cluster reinit (reseed to farthest point from any centroid), n_init multi-restart keeping the partition with lowest inertia, and a spherical variant that renormalizes centroids to the unit sphere after each update — the correct default for L2-normalized sentence-transformer embeddings.

**K-NN Graph Construction** (`src/graph.py`)
Used to build the edge set for the 3D topic graph. Constructs a symmetric undirected graph over cosine similarity: each node links to its k most similar peers, edges are symmetrized so (i, j) appears if j is in the top-k of i or i is in the top-k of j, self-loops are excluded, and edge weight is the cosine similarity of the pair.

**Cluster Topic Labeling** (`src/clustering.py`, `src/llm.py`)
Used to generate the human-readable cluster names shown in the legend. For each cluster, the 5 papers closest to the centroid are selected and their titles are passed to Qwen2.5-1.5B-Instruct via a 3-shot chat prompt. Falls back to the nearest paper's title if the LLM is unavailable.

**External Cluster Validation** (`scripts/sweep_n_clusters.py`, `notebooks/topic_graph.ipynb`)
Used to choose k=26. From-scratch Adjusted Rand Index (ARI) and Normalized Mutual Information (NMI) are computed against each paper's arXiv `primary_category` across a range of k values. Silhouette score is uninformative on high-dimensional sentence-transformer embeddings; ARI/NMI against ground-truth categories is used instead.

## File Structure

```
├── app.py                           # FastAPI backend
├── config.py                        # Central config (N_CLUSTERS, KNN_NEIGHBORS, ...)
├── requirements.txt
├── start-prod.sh                    # Start backend + frontend together (vite preview, prod build)
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
│   ├── encoder.py                   # Sentence-transformer encoding (late chunking)
│   ├── reranker.py                  # Cross-encoder reranking fallback
│   ├── llm.py                       # LLM generation (cluster labels, RAG answers, Scoot chat)
│   ├── papers_db.py                 # SQLite paper store + LRU-cached lookup
│   └── data.py                      # Parse raw ArXiv JSON into structured records
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx             # Landing page with corpus stats
│   │   │   ├── PaperBrowse.tsx      # Corpus reader + RAG Q&A + citations
│   │   │   ├── TopicGraph3D.tsx     # 3D topic-graph view with editable legend
│   │   │   ├── PaperEditor.tsx      # Live LaTeX editor (split-pane source + preview)
│   │   │   └── Library.tsx          # Saved papers and .tex draft manager
│   │   ├── components/
│   │   │   ├── ScootChat.tsx        # Floating Scoot assistant (draggable, resizable)
│   │   │   ├── CorpusGraph3D.tsx    # Three.js renderer (InstancedMesh + LineSegments)
│   │   │   ├── BlockEditor.tsx      # Block-level preview (KaTeX, Mermaid, code, tables)
│   │   │   └── PaperDetailDrawer.tsx# Side panel for paper metadata + passage preview
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

First, add the .env file from the Google Doc file we attached in our submission.

The run the following commands:

```bash
git clone https://github.com/kevinlindong/CSCI473_Project.git
cd CSCI473_Project

python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

./scripts/setup_data.sh   # downloads ~1.4 GB data snapshot

./start-prod.sh --rebuild      # first startup: builds the frontend bundle, then serves on :5173 (backend on :3001)
```

Subsequent runs can drop `--rebuild` (it'll reuse `frontend/dist/`); re-add it after editing frontend code.

Open http://localhost:5173. Vite preview serves the built bundle and the FastAPI backend handles `/api/*`.

**First query will be slow** (~30–60s) while the sentence-transformer model downloads (~400 MB). Subsequent queries are fast.

### Environment variables

Add the `.env` file from the Google Doc link attached in our submission to the project root before running `./start-prod.sh`. (Alternatively, copy `.env.example` to `.env` — the app runs without any keys in local inference mode, but an OpenRouter key is required for Scoot chat.)

| Variable             | Default                        | Description                                                        |
|----------------------|--------------------------------|--------------------------------------------------------------------|
| `OPENROUTER_API_KEY` | —                              | Required for Scoot chat (Claude Haiku via OpenRouter)              |
| `LLM_PROVIDER`       | `local`                        | `local` uses Qwen2.5-1.5B on-device for RAG; `openrouter` for all |
| `OPENROUTER_MODEL`   | `anthropic/claude-haiku-4.5`   | Model used when `LLM_PROVIDER=openrouter`                          |
| `ENABLE_LLM`         | `1`                            | Set to `0` for retrieval-only mode (no LLM synthesis)              |

### Full rebuild from scratch (~7 hr)

Use this to regenerate the corpus and embeddings rather than downloading the snapshot.

```bash
python scripts/fetch_papers.py        # fetch ~10k papers from ArXiv (~30 min)
python scripts/build_embeddings.py    # encode corpus (~2–3 hr, GPU recommended)
python scripts/build_papers_db.py     # build SQLite store (~5 min)
python scripts/compute_topic_graph.py # k-means + k-NN + UMAP + LLM labels (~1–2 hr)
./start-prod.sh --rebuild
```

### Notebook exploration (no frontend required)

```bash
jupyter lab notebooks/topic_graph.ipynb
```
