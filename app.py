"""
app.py — FastAPI backend for the ArXiv Research Assistant.

Run with: uvicorn app:app --reload

Endpoints:
  POST /api/query        — Ask a question, get a cited answer from relevant papers.
  GET  /api/topic-map    — Get PCA-projected embeddings with k-means cluster labels.
  GET  /api/papers       — List papers in the corpus.
  GET  /api/papers/{id}  — Get full details for a single paper.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


class PaperPoint(BaseModel):
    paper_id: str
    title: str
    x: float
    y: float
    cluster: int
    cluster_label: str


class TopicMapResponse(BaseModel):
    points: list[PaperPoint]


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


@app.get("/api/topic-map", response_model=TopicMapResponse)
async def topic_map():
    """Return PCA-projected embeddings with k-means cluster labels."""
    # TODO: load embeddings, run clustering + PCA, return points
    raise NotImplementedError


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
