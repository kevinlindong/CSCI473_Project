"""
app.py — FastAPI backend for the ArXiv Research Assistant.

Run with: uvicorn app:app --reload

Endpoints:
  GET  /api/health             — system status (which artifacts + models are loaded)
  POST /api/query              — full RAG: retrieve -> rerank -> synthesize cited answer
  GET  /api/papers             — list paper summaries (id, title, authors, abstract)
  GET  /api/papers/{id}        — full paper detail (sections, figures)
  GET  /api/topic-map          — precomputed k-means + k-NN graph for the 3D visualization
  GET  /api/query-projection   — encode query, return its nearest neighbors in abstract space
                                  (used to inject a virtual "query" node into the 3D graph)

Loading strategy:
  Heavy artifacts (embedding matrices, encoder, cross-encoder, LLM) are lazy-loaded
  on first use and cached at module scope. Keeps import + startup fast; the first
  /api/query call pays the model-load latency.

Env vars:
  ENABLE_LLM=0  — skip LLM answer synthesis (retrieval results still returned).
                  Useful on memory-constrained hosts or for fast iteration.
"""

import json
import os
import re
from functools import lru_cache
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

import config


app = FastAPI(title="ArXiv Research Assistant API")

# Gzip large responses on the wire. /api/topic-map is ~7 MB raw JSON;
# gzip drops it to ~2 MB, ~3× faster first-load on home internet.
# minimum_size avoids overhead on small responses (health, single paper).
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Module-level caches. All heavy state is lazy-loaded on first use and then
# retained for the life of the process. Prevents multi-second reload cost on
# every request while keeping `import app` cheap.
# --------------------------------------------------------------------------- #

_ABSTRACT_EMBS: Optional[np.ndarray] = None
_CHUNK_EMBS:    Optional[np.ndarray] = None
_CAPTION_EMBS:  Optional[np.ndarray] = None
_PAPER_INDEX:   Optional[dict]       = None

_ENCODER   = None  # SentenceTransformer
_RERANKER  = None  # CrossEncoder
_RETRIEVER = None  # src.retrieval.BruteForceRetriever

_TOPIC_GRAPH: Optional[dict] = None

ENABLE_LLM = os.environ.get("ENABLE_LLM", "1") != "0"


def _load_matrices():
    """Load the three embedding matrices and paper index from disk. Raises 503
    if the artifacts are missing (user needs to run build_embeddings.py)."""
    global _ABSTRACT_EMBS, _CHUNK_EMBS, _CAPTION_EMBS, _PAPER_INDEX
    if _ABSTRACT_EMBS is not None:
        return _ABSTRACT_EMBS, _CHUNK_EMBS, _CAPTION_EMBS, _PAPER_INDEX

    paths = {
        "abstracts.npy": os.path.join(config.EMBEDDINGS_DIR, "abstracts.npy"),
        "chunks.npy":    os.path.join(config.EMBEDDINGS_DIR, "chunks.npy"),
        "captions.npy":  os.path.join(config.EMBEDDINGS_DIR, "captions.npy"),
        "index.json":    os.path.join(config.EMBEDDINGS_DIR, "index.json"),
    }
    missing = [name for name, p in paths.items() if not os.path.exists(p)]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Embedding artifacts missing: {missing}. "
                f"Run: python scripts/build_embeddings.py"
            ),
        )

    _ABSTRACT_EMBS = np.load(paths["abstracts.npy"])
    _CHUNK_EMBS    = np.load(paths["chunks.npy"])
    _CAPTION_EMBS  = np.load(paths["captions.npy"])
    with open(paths["index.json"]) as f:
        _PAPER_INDEX = json.load(f)

    n_embs = len(_ABSTRACT_EMBS)
    n_ids  = len(_PAPER_INDEX.get("abstracts", []))
    if n_embs != n_ids:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Embedding artifacts are out of sync: abstracts.npy has {n_embs} rows "
                f"but index.json has {n_ids} abstract entries. "
                f"Rebuild with: python scripts/build_embeddings.py"
            ),
        )

    return _ABSTRACT_EMBS, _CHUNK_EMBS, _CAPTION_EMBS, _PAPER_INDEX


@lru_cache(maxsize=2048)
def _load_paper(paper_id: str) -> Optional[dict]:
    """Look up a single paper from data/papers.db. LRU-cached so popular
    papers stay hot. Returns None if the paper_id isn't present.

    Backed by src/papers_db.py. Build the database with
    `python scripts/build_papers_db.py` after fetching new papers.
    """
    from src import papers_db
    return papers_db.load_paper(paper_id)


def _get_encoder():
    """Lazy-load the sentence-transformer. First call pays ~5s + ~400MB RAM."""
    global _ENCODER
    if _ENCODER is None:
        from src import encoder as _enc
        _ENCODER = _enc.load_model()
    return _ENCODER


def _get_reranker():
    """Lazy-load the cross-encoder reranker. First call pays ~3s + ~100MB RAM."""
    global _RERANKER
    if _RERANKER is None:
        from src.reranker import load_reranker
        _RERANKER = load_reranker()
    return _RERANKER


def _get_retriever():
    """Lazy-construct the retriever and cache for the life of the process.

    Today's impl: BruteForceRetriever (numpy cosine over all abstracts).
    Past N ~= 30k, swap for a FAISS-backed Retriever in src/retrieval.py
    with the same .retrieve() surface and only this helper changes.
    """
    global _RETRIEVER
    if _RETRIEVER is None:
        from src.retrieval import BruteForceRetriever
        a, c, cap, idx = _load_matrices()
        _RETRIEVER = BruteForceRetriever(a, c, cap, idx, encoder=_get_encoder())
    return _RETRIEVER


def _load_topic_graph() -> dict:
    """Read the precomputed topic graph artifact. Cached after first call."""
    global _TOPIC_GRAPH
    if _TOPIC_GRAPH is not None:
        return _TOPIC_GRAPH
    path = os.path.join(config.PROCESSED_DIR, "topic_graph.json")
    if not os.path.exists(path):
        raise HTTPException(
            status_code=503,
            detail=(
                "Topic graph artifact missing. "
                "Run: python scripts/compute_topic_graph.py"
            ),
        )
    with open(path) as f:
        _TOPIC_GRAPH = json.load(f)
    return _TOPIC_GRAPH


# --------------------------------------------------------------------------- #
# Request / Response models
# --------------------------------------------------------------------------- #

class QueryRequest(BaseModel):
    question: str
    k: Optional[int] = None  # overrides config.N_RETRIEVAL_RESULTS when set


class Citation(BaseModel):
    paper_id: str
    title: str
    url: str
    passage: str
    heading: str = ""
    score: float = 0.0


class QueryResponse(BaseModel):
    answer: str
    answer_generated: bool     # False when LLM was skipped or failed; retrieval still returned
    reranked: bool             # True when the cross-encoder reranker fired
    citations: list[Citation]


class PaperSummary(BaseModel):
    paper_id: str
    title: str
    authors: list[str]
    abstract: str
    url: str = ""
    date: str = ""


class SectionOut(BaseModel):
    heading: str
    text: str


class FigureOut(BaseModel):
    caption: str
    image_path: str = ""


class PaperDetail(BaseModel):
    paper_id: str
    title: str
    authors: list[str]
    abstract: str
    date: str = ""
    url: str = ""
    sections: list[SectionOut]
    figures: list[FigureOut]


class GraphNode(BaseModel):
    paper_id: str
    title: str
    cluster: int
    # UMAP-precomputed 3D coordinates. Optional for back-compat with older
    # topic_graph.json artifacts that lack a layout step.
    x: Optional[float] = None
    y: Optional[float] = None
    z: Optional[float] = None


class GraphEdge(BaseModel):
    source: int
    target: int
    weight: float


class ClusterInfo(BaseModel):
    id: int
    label: str
    size: int


class TopicMapResponse(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    clusters: list[ClusterInfo]
    meta: Optional[dict] = None


class QueryNeighbor(BaseModel):
    paper_id: str
    similarity: float


class QueryProjectionResponse(BaseModel):
    query: str
    neighbors: list[QueryNeighbor]
    top_cluster: Optional[int]  # the cluster most represented in the neighbor set


class HealthResponse(BaseModel):
    status: str
    loaded: dict
    llm_enabled: bool


class ScootMessage(BaseModel):
    role: str       # 'user' | 'assistant'
    content: str


class ScootRequest(BaseModel):
    message: str
    history: Optional[list[ScootMessage]] = None


class ScootResponse(BaseModel):
    reply: str


# --------------------------------------------------------------------------- #
# Endpoints
# --------------------------------------------------------------------------- #

@app.get("/api/health", response_model=HealthResponse)
async def health():
    """Report which artifacts and models are currently loaded in this process."""
    emb_dir = config.EMBEDDINGS_DIR
    proc_dir = config.PROCESSED_DIR
    return HealthResponse(
        status="ok",
        loaded={
            "abstracts_npy": os.path.exists(os.path.join(emb_dir, "abstracts.npy")),
            "chunks_npy":    os.path.exists(os.path.join(emb_dir, "chunks.npy")),
            "captions_npy":  os.path.exists(os.path.join(emb_dir, "captions.npy")),
            "index_json":    os.path.exists(os.path.join(emb_dir, "index.json")),
            "papers_db":     os.path.exists(os.path.join(config.DATA_DIR, "papers.db")),
            "topic_graph":   os.path.exists(os.path.join(proc_dir, "topic_graph.json")),
            "matrices_cached": _ABSTRACT_EMBS is not None,
            "papers_cached":   _load_paper.cache_info().currsize,
            "encoder_loaded":  _ENCODER is not None,
            "reranker_loaded": _RERANKER is not None,
            "retriever_loaded": _RETRIEVER is not None,
        },
        llm_enabled=ENABLE_LLM,
    )


@app.post("/api/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """
    Full RAG pipeline:
      1. Encode the question.
      2. Two-stage retrieval: abstract k-NN → chunks/captions for those papers.
      3. Cross-encoder reranker kicks in when bi-encoder scores are weak/bunched.
      4. Assemble context, call LLM for a cited answer (if ENABLE_LLM).
      5. Parse [n] citation markers from the answer, return aligned source dicts.

    When ENABLE_LLM=0 or LLM loading fails, returns retrieval results with a
    stub answer and the top-k passages as citations so the frontend still
    renders something useful.
    """
    from src.reranker import rerank_passages, should_rerank

    if not req.question.strip():
        raise HTTPException(status_code=400, detail="question is required")

    k = req.k or config.N_RETRIEVAL_RESULTS
    result = _get_retriever().retrieve(req.question, k=k)

    passages = result["passages"]
    captions = result["captions"]
    reranked = False
    if passages and should_rerank(result["scores"]):
        reranker = _get_reranker()
        passages = rerank_passages(req.question, passages, model=reranker)
        reranked = True

    # Truncate to a reasonable context size. Captions continue the numbering.
    passages = passages[: config.N_RERANK_RESULTS]
    captions = captions[: config.N_RERANK_RESULTS]

    # Assemble aligned source list: position i <-> citation marker [i+1].
    sources: list[dict] = []
    for p in passages:
        meta = _load_paper(p["paper_id"]) or {}
        sources.append({
            "paper_id": p["paper_id"],
            "title":    p.get("paper_title") or meta.get("title", ""),
            "url":      meta.get("url") or f"https://arxiv.org/abs/{p['paper_id']}",
            "passage":  p.get("text", ""),
            "heading":  p.get("heading", ""),
            "score":    float(p.get("score", 0.0)),
        })
    for c in captions:
        meta = _load_paper(c["paper_id"]) or {}
        sources.append({
            "paper_id": c["paper_id"],
            "title":    c.get("title") or meta.get("title", ""),
            "url":      meta.get("url") or f"https://arxiv.org/abs/{c['paper_id']}",
            "passage":  f"(figure caption) {c.get('caption', '')}",
            "heading":  "figure",
            "score":    float(c.get("score", 0.0)),
        })

    # --- LLM synthesis (optional) -----------------------------------------
    answer_text = ""
    answer_generated = False
    if ENABLE_LLM and sources:
        try:
            from src.llm import build_context, generate_answer
            passage_texts = [p.get("text", "") for p in passages]
            caption_texts = [c.get("caption", "") for c in captions]
            context = build_context(passage_texts, captions=caption_texts)
            answer_text = generate_answer(req.question, context)
            answer_generated = True
        except Exception as e:
            # LLM failure is recoverable — fall back to retrieval-only mode so
            # the user still sees the cited passages.
            answer_text = (
                f"LLM synthesis unavailable ({type(e).__name__}: {e}). "
                "Showing retrieved passages below."
            )
    elif not sources:
        answer_text = "No relevant passages found in the corpus."
    else:
        answer_text = "LLM synthesis disabled (ENABLE_LLM=0). Showing retrieved passages below."

    # Parse citation markers [1], [2], ... from the answer.
    cited_nums = sorted({int(m) for m in re.findall(r"\[(\d+)\]", answer_text)})
    citations: list[Citation] = []
    if cited_nums:
        for n in cited_nums:
            if 1 <= n <= len(sources):
                s = sources[n - 1]
                citations.append(Citation(**s))
    if not citations and sources:
        # LLM cited nothing (or was disabled) — return the top retrieval hits
        # so the UI has something to render instead of a bare answer.
        for s in sources[: config.N_RERANK_RESULTS]:
            citations.append(Citation(**s))

    return QueryResponse(
        answer=answer_text,
        answer_generated=answer_generated,
        reranked=reranked,
        citations=citations,
    )


@app.get("/api/papers", response_model=list[PaperSummary])
async def list_papers(
    cluster: Optional[int] = Query(None, description="Filter by cluster id"),
    limit: Optional[int] = Query(None, ge=1, le=2000),
):
    """List paper summaries. Optionally filter by cluster id.

    Uses a single SQL query over only the summary columns
    (paper_id, title, abstract, date, url, authors). Critically does NOT
    deserialize sections_json / figures_json — those are tens of KB per
    paper and the listing endpoint never renders them. Without this
    distinction the no-filter listing took ~27s for 10k papers; with it,
    well under one second.
    """
    from src import papers_db

    paper_ids: Optional[list[str]] = None
    if cluster is not None:
        tg = _load_topic_graph()
        paper_ids = [
            n["paper_id"] for n in tg.get("nodes", []) if n["cluster"] == cluster
        ]

    out: list[PaperSummary] = []
    for p in papers_db.list_paper_summaries(paper_ids=paper_ids, limit=limit):
        out.append(PaperSummary(
            paper_id=p["paper_id"],
            title=p.get("title", ""),
            authors=p.get("authors", []),
            abstract=p.get("abstract", ""),
            url=p.get("url", "") or f"https://arxiv.org/abs/{p['paper_id']}",
            date=p.get("date", ""),
        ))
    return out


@app.get("/api/papers/{paper_id}", response_model=PaperDetail)
async def get_paper(paper_id: str):
    """Full paper detail — title, authors, abstract, sections, figures."""
    p = _load_paper(paper_id)
    if p is None:
        raise HTTPException(status_code=404, detail=f"paper {paper_id} not found")

    return PaperDetail(
        paper_id=p["paper_id"],
        title=p.get("title", ""),
        authors=p.get("authors", []),
        abstract=p.get("abstract", ""),
        date=p.get("date", ""),
        url=p.get("url", "") or f"https://arxiv.org/abs/{paper_id}",
        sections=[SectionOut(**s) for s in p.get("sections", [])],
        figures=[FigureOut(**f) for f in p.get("figures", [])],
    )


@app.get("/api/topic-map", response_model=TopicMapResponse)
async def topic_map():
    """Serve the precomputed k-means + k-NN topic graph artifact."""
    return _load_topic_graph()


@app.post("/api/scoot", response_model=ScootResponse)
async def scoot(req: ScootRequest):
    """Generate a chat reply from the local Qwen model with the scoot system prompt."""
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message is required")
    if not ENABLE_LLM:
        raise HTTPException(status_code=503, detail="LLM disabled (ENABLE_LLM=0)")
    try:
        from src.llm import generate_scoot_reply
        history = [m.model_dump() for m in (req.history or [])]
        reply = generate_scoot_reply(req.message, history=history)
        return ScootResponse(reply=reply)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")


@app.get("/api/query-projection", response_model=QueryProjectionResponse)
async def query_projection(
    q: str = Query(..., min_length=1, description="The query text"),
    k: int = Query(8, ge=1, le=50, description="Number of neighbors to return"),
):
    """
    Encode the query into abstract-embedding space and return its top-k nearest
    papers. The frontend uses this to inject a virtual "query" node into the 3D
    force graph with edges to each neighbor — the simulation then places the
    query node spatially among its matches.

    Cheaper than /api/query: one encode + one cosine pass, no LLM, no rerank.
    """
    from src.retrieval import cosine_similarity, top_k_indices

    abstract_embs, _, _, paper_index = _load_matrices()
    encoder = _get_encoder()
    from src import encoder as _enc
    q_vec = _enc.encode([q], encoder)[0]

    # One cosine pass — derive top-k from the precomputed scores instead of
    # calling nearest_neighbors() (which would recompute cosine internally).
    scores = cosine_similarity(q_vec, abstract_embs)
    top_rows = top_k_indices(scores, k)
    abstract_ids = paper_index.get("abstracts", [])

    neighbors = [
        QueryNeighbor(
            paper_id=abstract_ids[i],
            similarity=float(scores[i]),
        )
        for i in top_rows
    ]

    # Which cluster gets the most votes among the returned neighbors?
    top_cluster: Optional[int] = None
    try:
        tg = _load_topic_graph()
        cluster_by_id = {n["paper_id"]: n["cluster"] for n in tg.get("nodes", [])}
        from collections import Counter
        votes = Counter(
            cluster_by_id[nb.paper_id]
            for nb in neighbors
            if nb.paper_id in cluster_by_id
        )
        if votes:
            top_cluster = votes.most_common(1)[0][0]
    except HTTPException:
        # Topic graph missing — that's fine, projection still works without it.
        pass

    return QueryProjectionResponse(
        query=q,
        neighbors=neighbors,
        top_cluster=top_cluster,
    )
