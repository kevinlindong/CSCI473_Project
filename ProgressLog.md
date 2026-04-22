# Progress Log — ArXiv Research Assistant

Rolling log of what has landed on the project, in reverse chronological order. Grounded in git history; see `git log` for commit-level detail.

---

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

### Retrieval track
- **Pre-existing flake:** `tests/test_retrieval.py::test_string_query_routes_through_encoder` fails when `test_encoder.py` runs before it in the same pytest invocation. Import-caching gotcha — `from src import encoder` inside `retrieve()` reads the cached `src.encoder` attribute, bypassing the monkeypatched `sys.modules` entry. Passes in isolation (`pytest tests/test_retrieval.py` → 20/20). Owner: Xan.

### Not yet started (per `PLAN.md`)
- **Clustering / PCA / topic map** — `src/clustering.py`, `src/pca.py`, `tests/test_clustering.py`, `tests/test_pca.py` are stubs. `GET /api/topic-map` in `app.py` is `NotImplementedError`. No frontend topic-map page exists. Owner: Kevin Dong.
- **LLM answer generation** — `src/llm.py` (`build_context`, `generate_answer`, `format_response`) is all `NotImplementedError`. `POST /api/query` in `app.py` is a stub. Owner: Kevin Pei.
- **CLIP figure fallback** — `src/figures.py` not implemented. Owner: Kevin Pei.
- **Paper listing endpoints** — `GET /api/papers` and `GET /api/papers/{id}` in `app.py` are stubs.

### Integration
- **`app.py` startup wiring** — embeddings and models need to be loaded once at FastAPI startup (lifespan), not per-request. Currently no startup logic exists.
