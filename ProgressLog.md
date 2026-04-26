# Progress Log — ArXiv Research Assistant

Rolling log of what has landed on the project, in reverse chronological order. Grounded in git history; see `git log` for commit-level detail.

---

## 2026-04-26 — Query node placement fix + Query Constellation filter (Ian)

- Diagnosed visual bug: virtual query nodes rendered at `(0, 0, 0)` because `CustomGraph3D.tsx`'s `node.x ?? 0` fallback fired on the unpositioned query. The UMAP cloud lives at scaled `x∈[219, 994]`, so the query landed well outside every cluster.
- Wrote `notebooks/query_distance_analysis.ipynb` to separate encoder placement from renderer placement quantitatively, on the live 10k-paper corpus:
  - Embedding-space cosine distance, query → nearest cluster centroid: 0.23–0.60 (paper baseline p50=0.327, p95=0.524). Most queries are in-distribution or borderline; the encoder is fine.
  - UMAP corrected (centroid of top-k neighbors) vs bug (origin): **0.10–0.50× cluster spread vs 3.3–5.0×**. Bug overshoots the semantically correct position by **16.79×** on average across in-domain queries.
  - Notebook is committed with executed outputs + a Plotly 3D fix-preview cell so it renders fully on GitHub without a kernel.
- Applied the centroid-of-neighbors placement fix in both `TopicGraph3D.tsx` and `CorpusGraph3D.tsx` (each builds its query node independently). Honors the existing `COORD_SCALE = 100` by reading from the post-scale `vizNodes` array.
- Added a **Query Constellation** toggle to the corpus-map sidebar (`PaperBrowse.tsx` + `CorpusGraph3D.tsx`) and the topic-graph sidebar (`TopicGraph3D.tsx`):
  - Dedicated section above the cluster legend, with empty-state copy when no query is active.
  - Click to isolate the query node + its top-k neighbors; composes with cluster isolation as a union.
  - Auto-clears when the query empties so the toggle can't sit "active" with nothing to show.
  - Folds into existing `nodeColor` / `nodeVisibility` / `linkVisibility` memos; cost is one extra Set lookup per node.

## 2026-04-26 — Visualization rewrite (Xan)

- Replaced `react-force-graph-3d` with a direct Three.js renderer in `frontend/src/components/CustomGraph3D.tsx` (831 lines). All nodes drawn as one `InstancedMesh` of low-poly spheres; all edges as one `LineSegments`. Collapses ~33,000 per-frame draw calls down to ~3, restoring 60fps rotate/zoom on integrated GPUs at 10k nodes + 20k edges.
- Explicit `powerPreference: 'high-performance'` on the `WebGLRenderer` to pick the discrete GPU on multi-GPU systems.
- Added `frontend/src/lib/topicGraphCache.ts` — module-level + localStorage stale-while-revalidate cache for `/api/topic-map`. First paint is instant on subsequent navigations; in-flight fetch is shared across callers.
- Added `start-prod.sh` for production-bundled local serving (`vite build` + `vite preview` + uvicorn without `--reload`).
- Wired `frontend/vite.config.ts` to proxy `/api` to `localhost:3001` for both `vite dev` and `vite preview`.

## 2026-04-26 — Reliable agent fuzzy finder (Kevin Dong)

- Frontend agent-search UX work. Added more enriched paper JSON files under `data/raw/enriched/`. Untracked `.logs/frontend.log` from version control (the runtime log file kept reappearing).

## 2026-04-25 — UMAP 3D layout + ambient drift (Xan)

- Switched topic-graph layout from force-directed to UMAP 3D in `scripts/compute_topic_graph.py`. Now serializes `(x, y, z)` per node from `umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.1, metric='cosine')` so the frontend renders a precomputed layout — no force loop in the browser.
- Added `frontend/src/hooks/useAmbientDrift.ts` for subtle node drift (~0.5% of layout span) so the static layout still feels alive.
- Added `umap-learn` to `requirements.txt`.

## 2026-04-25 — 10k paper scale-up (Xan)

- Scaled the corpus from 273 → **10,000 papers**. `topic_graph.json` rebuilt at 10k with k=26 clusters.
- Replaced the per-paper JSON load path with a SQLite store: added `scripts/build_papers_db.py` and `src/papers_db.py`. `app.py` reads via an LRU-cached lookup so popular papers stay hot.
- Added `scripts/cluster_stability.py` and `scripts/sweep_n_clusters.py`. Persisted `data/processed/cluster_stability.json` and `sweep_n_clusters.json` so the chosen k=26 is reproducible from data, not hand-tuned.
- Added `scripts/setup_data.sh` driving the full data pipeline (fetch → enrich → embeddings → papers.db → topic graph).

## 2026-04-25 — Scoot RAG chatbot + sample papers (Kevin Dong)

- Added `frontend/src/components/ScootChat.tsx` and `ScootFab.tsx` — floating chat assistant backed by `/api/scoot` (local Qwen2.5-1.5B-Instruct) with the `qwen_prompt` system prompt. Two iterations.
- Editor sample-paper templates landed under `frontend/src/sample-papers/` (CNN classification, GAN synthesis, LSTM time-series, GNN molecular property, contrastive SSL).
- `src/llm.py` updates for the chat path — chat-template'd messages, conversation history, scoot system prompt loader.

## 2026-04-24 — Frontend ↔ backend integration (Kevin Dong)

- Wired the React app to the live FastAPI backend (~3 commits): `PaperBrowse`, `PaperEditor`, `CorpusGraph3D`, latex/markdown rendering, library/drafts/document hooks. Many `app.py` route changes followed.

## 2026-04-24 — GPU speedup for reranker (Ian)

- Marginal 12-line change in `src/reranker.py` to honor device selection (CUDA/MPS/CPU) when constructing the `CrossEncoder` rather than letting it default to CPU on machines that have a GPU.

## 2026-04-23 — Clustering + topic graph pipeline (Xan)

- Implemented `src/clustering.py` (k-means with k-means++ init + spherical renormalization) and `src/graph.py` (cosine-similarity k-NN graph, symmetrized).
- `scripts/compute_topic_graph.py` end-to-end: cluster + label + k-NN + serialize.
- `src/llm.py` cluster-labeling path (initially flan-T5; later swapped to Qwen2.5-1.5B-Instruct after the small T5 produced single-word/extractive labels).
- Added `frontend/src/pages/TopicGraph3D.tsx` and `frontend/src/hooks/useClusterLabels.ts` (browser-local cluster-label overrides via localStorage).
- `notebooks/topic_graph.ipynb` — k-sweep with silhouette, ARI, and NMI vs arXiv `primary_category`. Live label-editor widget.
- Tests: `tests/test_clustering.py`, `tests/test_graph.py`. `GET /api/topic-map` stood up in `app.py`.

## 2026-04-21 — Reranker fallback + sanity notebook (Ian)

- Implemented the cross-encoder reranker in `src/reranker.py`, replacing the four `NotImplementedError` stubs. Four functions:
  - `load_reranker()` — lazy-loads `sentence_transformers.CrossEncoder` (default `cross-encoder/ms-marco-MiniLM-L-6-v2`).
  - `rerank(query, passages: list[str], model=None)` — preserves the original stub signature; returns sorted `(passage, score)` tuples.
  - `rerank_passages(query, passages: list[dict], model=None)` — consumes the dict-form passages from `retrieve()` directly; replaces the bi-encoder cosine with the cross-encoder score. Non-mutating.
  - `should_rerank(scores, score_threshold=0.5, spread_threshold=0.15)` — confidence trigger per `PLAN.md` fallback semantics. Fires on low top-1 or tight top-K spread.
- Added `tests/test_reranker.py` — 16 tests, all passing (0.04s). Uses a `FakeCrossEncoder` injected via the `model=` parameter so the suite runs without torch/sentence-transformers. Mirrors the DI pattern Xan used in `test_retrieval.py`.
- Added `notebooks/reranking.ipynb` — picks up the ambiguous RLHF query from Xan's `retrieval.ipynb` and demonstrates: before/after reranking, the `should_rerank()` trigger on three query profiles, and an end-to-end `retrieve_with_fallback()` wrapper that is the shape `app.py` will call.

## 2026-04-21 — Retrieval mechanism (Xan)

- Implemented from-scratch cosine similarity nearest-neighbor search in `src/retrieval.py` using numpy primitives only (no sklearn, no faiss).
- Two-stage pipeline: abstract-level top-k → chunk and caption scoring within those papers → globally sorted passage/caption lists.
- `retrieve()` accepts either a string query (lazy-loads the encoder) or a pre-encoded vector (skips encoder entirely — useful for tests).
- Added `tests/test_retrieval.py` — 20 tests covering cosine edge cases (zero vectors, magnitude invariance, opposite vectors), nearest-neighbor correctness, and end-to-end retrieval on a tiny handcrafted corpus.
- Added `notebooks/retrieval.ipynb` — end-to-end sanity check against the real 273-paper corpus with two example queries.

## 2026-04-21 — Frontend polish (Kevin Dong)

- Two commits updating React components: Navbar, Landing, Login, PaperBrowse, PaperEditor, Profile, Home, and index.css.
- Added `ErrorBoundary` component.

## 2026-04-20 — Incremental embedding pipeline + exploration notebook (Vivek)

- Reworked `scripts/build_embeddings.py` to support incremental builds over the corpus rather than full rebuilds.
- Added exploration notebook for pipeline sanity checks.

## 2026-04-20 — Frontend iteration (Kevin Dong)

- Additional frontend work on the React app.

## 2026-04-17 — Embedding pipeline rework (Vivek)

- Restructured the embedding pipeline, including adoption of late-chunking in `src/encoder.py::late_chunk_encode` — tokenizes the full context-prefixed section as one sequence, then mean-pools token embeddings per chunk's character span.

## 2026-04-12 — Encoder + chunker + build_embeddings pipeline (Vivek)

- Added `src/encoder.py` (sentence-transformer wrapper), `src/chunker.py`, and `scripts/build_embeddings.py`.
- Added tests for chunker and encoder.

## 2026-04-08 — Paper fetching (Xan)

- Implemented `scripts/fetch_papers.py` — Arxiv API → `data/raw/`.
- Landed raw data files and enriched paper set.
- Cleaned out erroneous papers.

## 2026-03-30 — Frontend + README (Kevin Dong)

- Initial frontend scaffold and README.

## 2026-03-28 — Initial architecture (Xan)

- Repo structure, stubs, `PLAN.md` written proposal and division of labor.

## 2026-02-09 — Initial commit (Kevin Dong)

---

## Outstanding items

### Still open
- **Pre-existing test flake:** `tests/test_retrieval.py::test_string_query_routes_through_encoder` fails when `test_encoder.py` runs before it in the same pytest invocation. Import-caching gotcha — `from src import encoder` inside `retrieve()` reads the cached `src.encoder` attribute, bypassing the monkeypatched `sys.modules` entry. Passes in isolation (`pytest tests/test_retrieval.py` → 20/20). Owner: Xan.
- **`app.py` startup wiring** — still uses lazy module-level caching (`_get_encoder`, `_get_reranker`, `_load_matrices`) instead of FastAPI `lifespan`. First request after boot pays the encoder + LLM load. Acceptable for dev; should switch to `lifespan` for prod.

### Recently closed
- ~~PCA stub~~ — `src/pca.py` was never implemented; UMAP replaced it in `compute_topic_graph.py`. File and `tests/test_pca.py` removed 2026-04-26.
- ~~CLIP figure fallback~~ — `src/figures.py` was never implemented; figure-side retrieval works via captions in the chunk space. File removed 2026-04-26.

### Recently closed
- ~~Clustering / topic map~~ — landed 2026-04-23 (Xan): `src/clustering.py`, `src/graph.py`, `scripts/compute_topic_graph.py`, `GET /api/topic-map`, `TopicGraph3D.tsx`. UMAP layout + drift added 2026-04-25.
- ~~LLM answer generation~~ — `src/llm.py` runs Qwen2.5-1.5B-Instruct with chat templates and serves `/api/query` (RAG) plus `/api/scoot` (chat). Cluster labeling, scoot replies, and answer synthesis all share the lazy-loaded model.
- ~~Paper listing endpoints~~ — `/api/papers` and `/api/papers/{id}` live, backed by SQLite (`src/papers_db.py`) + LRU cache.
