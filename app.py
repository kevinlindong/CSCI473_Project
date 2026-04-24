"""
app.py — FastAPI backend for the ArXiv Research Assistant.

Run with: uvicorn app:app --reload

Endpoints:
  POST /api/query        — Ask a question, get a cited answer from relevant papers.
  GET  /api/topic-map    — k-means clusters + k-NN edges for the 3D topic graph.
  GET  /api/papers       — List papers in the corpus.
  GET  /api/papers/{id}  — Get full details for a single paper.
"""

import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config

app = FastAPI(title="ArXiv Research Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------- Request / Response Models ---------------

class QueryRequest(BaseModel):
    question: str


class Citation(BaseModel):
    paper_id: str
    title: str
    url: str
    passage: str


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]


class GraphNode(BaseModel):
    paper_id: str
    title: str
    cluster: int


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
    meta: dict | None = None


class PaperSummary(BaseModel):
    paper_id: str
    title: str
    authors: list[str]
    abstract: str


class PaperDetail(BaseModel):
    paper_id: str
    title: str
    authors: list[str]
    abstract: str
    sections: list[dict]
    figures: list[dict]


# --------------- Endpoints ---------------

@app.post("/api/query", response_model=QueryResponse)
async def query(req: QueryRequest):
    """Encode query, retrieve papers, generate cited answer."""
    # TODO: encode query, retrieve papers, generate answer
    raise NotImplementedError


_TOPIC_GRAPH_CACHE: dict | None = None


def _load_topic_graph() -> dict:
    """Read data/processed/topic_graph.json. Cached after first call."""
    global _TOPIC_GRAPH_CACHE
    if _TOPIC_GRAPH_CACHE is not None:
        return _TOPIC_GRAPH_CACHE
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
        _TOPIC_GRAPH_CACHE = json.load(f)
    return _TOPIC_GRAPH_CACHE


@app.get("/api/topic-map", response_model=TopicMapResponse)
async def topic_map():
    """Serve the precomputed k-means + k-NN topic graph."""
    return _load_topic_graph()


@app.get("/api/papers", response_model=list[PaperSummary])
async def list_papers():
    """List all papers in the corpus."""
    # TODO: load corpus, return summaries
    raise NotImplementedError


@app.get("/api/papers/{paper_id}", response_model=PaperDetail)
async def get_paper(paper_id: str):
    """Get full details for a single paper."""
    # TODO: load paper by ID, return details
    raise NotImplementedError
