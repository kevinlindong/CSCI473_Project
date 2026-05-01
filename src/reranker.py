"""Cross-encoder reranking fallback.

Bi-encoder embeds query and passage independently; cross-encoder scores
(query, passage) jointly. Slower but better at separating semantically close
candidates. Used when bi-encoder confidence is weak (see should_rerank).
"""


def load_reranker(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    import torch
    from sentence_transformers import CrossEncoder
    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    return CrossEncoder(model_name, device=device)


def rerank(query: str, passages: list[str], model=None) -> list[tuple[str, float]]:
    if not passages:
        return []
    if model is None:
        model = load_reranker()
    pairs = [(query, p) for p in passages]
    scores = model.predict(pairs)
    ranked = sorted(zip(passages, scores), key=lambda pair: pair[1], reverse=True)
    return [(p, float(s)) for p, s in ranked]


def rerank_passages(query: str, passages: list[dict], model=None) -> list[dict]:
    """Rerank dict-form passages from src.retrieval.retrieve(). Returns a new list."""
    if not passages:
        return []
    if model is None:
        model = load_reranker()
    pairs = [(query, p["text"]) for p in passages]
    scores = model.predict(pairs)
    rescored = [{**p, "score": float(s)} for p, s in zip(passages, scores)]
    rescored.sort(key=lambda p: p["score"], reverse=True)
    return rescored


def should_rerank(
    scores: list[float],
    score_threshold: float = 0.5,
    spread_threshold: float = 0.15,
) -> bool:
    """Trigger reranking when top-1 is weak or top-K scores are bunched."""
    if not scores:
        return False
    if scores[0] < score_threshold:
        return True
    if len(scores) >= 2 and (scores[0] - scores[-1]) < spread_threshold:
        return True
    return False
