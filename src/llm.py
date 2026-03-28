"""
llm.py — LLM answer generation with citation formatting.

Assembles retrieved passages, captions, and figures into a context window,
calls an LLM to generate a cited answer, and formats the response.
"""


def build_context(passages: list[str], captions: list[str] = None, figures: list[str] = None) -> str:
    """
    Assemble retrieved content into a numbered context string for the LLM prompt.

    Args:
        passages: Retrieved text passages from papers.
        captions: Retrieved figure captions.
        figures: Paths to retrieved figure images.

    Returns:
        A formatted context string with numbered citations.
    """
    raise NotImplementedError


def generate_answer(query: str, context: str, model_name: str = None) -> str:
    """
    Call an LLM with the query and assembled context to produce a cited answer.

    Args:
        query: The user's natural language question.
        context: Formatted context string from build_context().
        model_name: LLM to use. If None, uses config default.

    Returns:
        Answer string with inline citation markers like [1], [2].
    """
    raise NotImplementedError


def format_response(answer: str, sources: list[dict]) -> dict:
    """
    Package the answer, citation list, and figure references for display.

    Args:
        answer: The LLM-generated answer with citation markers.
        sources: List of source dicts with keys: paper_id, title, url, passage.

    Returns:
        Dict with keys: answer, citations, figures.
    """
    raise NotImplementedError
