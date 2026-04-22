"""
reranker.py — Cross-encoder reranking fallback.

Per PLAN.md: a pretrained cross-encoder is used to re-score candidate passages
when abstract-level retrieval produces low-confidence results (top score below
threshold or top-K scores bunched together).

Unlike the bi-encoder used in src/retrieval.py — which embeds query and passage
independently — a cross-encoder scores (query, passage) jointly, attending
across both sequences. Slower per pair, but markedly better at separating
semantically close-but-off-topic candidates from true matches.
"""


def load_reranker(model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"):
    """Load a pretrained cross-encoder model.

    Lazy-imports sentence_transformers so callers that pass `model=...` to
    rerank() never pay the torch import cost.
    """
    from sentence_transformers import CrossEncoder
    return CrossEncoder(model_name)


def rerank(query: str, passages: list[str], model=None) -> list[tuple[str, float]]:
    """
    Re-score passages using a cross-encoder and return sorted by relevance.

    Args:
        query: The user's natural language query.
        passages: List of candidate passage strings.
        model: Pre-loaded cross-encoder. Lazy-loaded via load_reranker() when
               None — useful for tests that inject a fake.

    Returns:
        List of (passage, score) tuples sorted by descending score.
    """
    if not passages:
        return []
    if model is None:
        model = load_reranker()
    pairs = [(query, p) for p in passages]
    scores = model.predict(pairs)
    ranked = sorted(zip(passages, scores), key=lambda pair: pair[1], reverse=True)
    return [(p, float(s)) for p, s in ranked]


def rerank_passages(query: str, passages: list[dict], model=None) -> list[dict]:
    """
    Re-score the dict-form passages returned by src.retrieval.retrieve().

    The cross-encoder score replaces the bi-encoder cosine score in each dict
    so downstream consumers (LLM context builder, citation formatter) can
    treat reranked and non-reranked results uniformly.

    Args:
        query: The user's natural language query.
        passages: List of dicts as emitted by retrieve()['passages'] —
                  expected keys: paper_id, paper_title, heading, text, score.
        model: Pre-loaded cross-encoder. Lazy-loaded when None.

    Returns:
        New list of dicts (input is not mutated), sorted by descending score.
    """
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
    """
    Decide whether to invoke the reranker based on bi-encoder score profile.

    Per PLAN.md the reranker is a fallback "when abstracts are missing or
    low-quality". Two signals approximate that:

      1. Top-1 cosine below score_threshold → no candidate looks strong.
      2. Spread between top-1 and top-K below spread_threshold → candidates
         are bunched together, the bi-encoder cannot separate them, and a
         joint cross-encoder score is more likely to break the tie.

    Either condition triggers reranking.

    Args:
        scores: Abstract-level cosine scores (descending), e.g.
                retrieve()['scores'].
        score_threshold: Minimum top-1 score considered "confident".
        spread_threshold: Minimum top-1 minus top-K gap considered "confident".
                          Defaults to 0.15 so ambiguously clustered top-k
                          results like the RLHF notebook example still trigger
                          the fallback.

    Returns:
        True if reranking is warranted.
    """
    if not scores:
        return False
    if scores[0] < score_threshold:
        return True
    if len(scores) >= 2 and (scores[0] - scores[-1]) < spread_threshold:
        return True
    return False
