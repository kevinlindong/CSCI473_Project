"""
llm.py — LLM text generation for two features.

1. Cluster labeling: generate_cluster_label(titles) takes a handful of paper
   titles representative of a cluster and returns a short topic name via a
   small instruction-tuned causal LM (Qwen2.5-1.5B-Instruct by default).

2. RAG answer generation: build_context() / generate_answer() / format_response()
   compose a minimal retrieval-augmented generation pipeline using the same
   underlying model.

Both features share a lazy-loaded, module-cached AutoModelForCausalLM + tokenizer
so imports are free until the first call actually needs the model.

History: a previous iteration used flan-T5-base via AutoModelForSeq2SeqLM. At 250M
params it was prone to either single-word or extractively-copied outputs, so we
switched to a modern instruction-tuned causal LM with chat templates.
"""

import re
from typing import Optional

import config


_TOKENIZER = None
_MODEL = None


def _get_model(model_name: Optional[str] = None):
    """
    Lazy-load an instruction-tuned causal LM + tokenizer. Cached module-level.

    Uses AutoModelForCausalLM so any modern chat-tuned model (Qwen, Phi, Llama,
    etc.) works by just changing config.LLM_MODEL_NAME.
    """
    global _TOKENIZER, _MODEL
    if _MODEL is None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        name = model_name or config.LLM_MODEL_NAME
        _TOKENIZER = AutoTokenizer.from_pretrained(name)
        dtype = torch.float32  # CPU-safe default; model.to("cuda") upstream if you have a GPU
        _MODEL = AutoModelForCausalLM.from_pretrained(name, dtype=dtype)
        _MODEL.eval()
    return _TOKENIZER, _MODEL


def _chat_generate(
    messages: list[dict],
    max_new_tokens: int,
    model_name: Optional[str] = None,
) -> str:
    """
    Run deterministic greedy generation over a chat-template'd prompt and return
    only the assistant's new tokens (not the input).
    """
    import torch
    tokenizer, model = _get_model(model_name)

    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True,
    )
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            num_beams=1,
            pad_token_id=tokenizer.eos_token_id,
        )

    # Strip the prompt tokens; decode only the new tokens.
    new_tokens = out[0][inputs.input_ids.shape[1]:]
    return tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


# ---------------------------------------------------------------------------
# Cluster labeling (used by src.clustering.assign_topic_labels)
# ---------------------------------------------------------------------------


_LABEL_SYSTEM_PROMPT = (
    "You label clusters of research papers. Given paper titles, output a short "
    "research topic label of 2 to 5 words. Reply with ONLY the label — no prefix, "
    "no punctuation, no quotes, no explanation."
)

_LABEL_FEW_SHOT = [
    (
        [
            "BERT: Pre-training of Deep Bidirectional Transformers",
            "GPT-3: Language Models are Few-Shot Learners",
            "RoBERTa: A Robustly Optimized BERT",
        ],
        "pretrained language models",
    ),
    (
        [
            "SimCLR: A Simple Framework for Contrastive Learning",
            "CLIP: Learning Transferable Visual Models",
            "MoCo: Momentum Contrast for Visual Representation Learning",
        ],
        "contrastive representation learning",
    ),
    (
        [
            "DDPG: Continuous Control with Deep Reinforcement Learning",
            "PPO: Proximal Policy Optimization Algorithms",
            "TRPO: Trust Region Policy Optimization",
        ],
        "deep reinforcement learning",
    ),
]


def _format_titles(titles: list[str]) -> str:
    return "Titles:\n" + "\n".join(f"- {t}" for t in titles)


def _cluster_label_messages(titles: list[str]) -> list[dict]:
    """Build the chat-template messages list with few-shot examples + final query."""
    messages: list[dict] = [{"role": "system", "content": _LABEL_SYSTEM_PROMPT}]
    for ex_titles, ex_label in _LABEL_FEW_SHOT:
        messages.append({"role": "user",      "content": _format_titles(ex_titles)})
        messages.append({"role": "assistant", "content": ex_label})
    messages.append({"role": "user", "content": _format_titles(titles)})
    return messages


def generate_cluster_label(titles: list[str], max_new_tokens: int = 24) -> str:
    """
    Summarize a set of paper titles into a short research topic label.

    Uses few-shot chat-style prompting with a modern instruction-tuned causal LM.
    Three in-context examples (pretrained LMs / contrastive learning / deep RL)
    pin the output shape to a short noun phrase.

    Args:
        titles: Representative paper titles for one cluster (best: 3–8 titles).
        max_new_tokens: Generation budget. 24 tokens is comfortably above the
            expected 2–5 word output and lets the model generate a complete
            phrase before EOS.

    Returns:
        A short topic label. Never empty — falls back to the first non-empty
        title when the model declines to produce anything useful.
    """
    titles = [t for t in titles if t and t.strip()]
    if not titles:
        return ""

    messages = _cluster_label_messages(titles)
    raw = _chat_generate(messages, max_new_tokens=max_new_tokens)

    # Normalize: take first line, strip trailing punctuation, drop surrounding quotes.
    text = raw.split("\n")[0].strip()
    text = text.strip("\"'`")
    text = text.rstrip(".").strip()
    # Some models prefix a label with "Topic:" or similar — strip it.
    for prefix in ("Topic:", "Label:", "Answer:", "Topic -", "Label -"):
        if text.lower().startswith(prefix.lower()):
            text = text[len(prefix):].strip()
    return text or titles[0]


# ---------------------------------------------------------------------------
# RAG helpers (used by /api/query)
# ---------------------------------------------------------------------------


def build_context(
    passages: list[str],
    captions: Optional[list[str]] = None,
    figures: Optional[list[str]] = None,
) -> str:
    """
    Assemble retrieved content into a numbered context string for the LLM.

    Passages are numbered [1..n]; captions continue the numbering; figures are
    appended as tagged references without taking a citation slot.
    """
    captions = captions or []
    figures = figures or []
    parts: list[str] = []
    n = 1
    for p in passages:
        parts.append(f"[{n}] {p}")
        n += 1
    for c in captions:
        parts.append(f"[{n}] (caption) {c}")
        n += 1
    for f in figures:
        parts.append(f"[figure: {f}]")
    return "\n\n".join(parts)


def generate_answer(query: str, context: str, model_name: Optional[str] = None) -> str:
    """
    Call the LLM with the query and assembled context to produce a cited answer.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "Answer the user's question using only the provided context. "
                "Cite sources inline as [1], [2], etc. when you use them. "
                "If the context does not answer the question, say so plainly."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {query}",
        },
    ]
    return _chat_generate(messages, max_new_tokens=256, model_name=model_name)


def format_response(answer: str, sources: list[dict]) -> dict:
    """
    Package the answer, citation list, and figure references for display.
    """
    cited_numbers = sorted({int(m) for m in re.findall(r"\[(\d+)\]", answer)})
    citations = [
        sources[n - 1] for n in cited_numbers if 0 < n <= len(sources)
    ]
    figures = [
        s.get("figure") for s in sources
        if isinstance(s, dict) and s.get("figure")
    ]
    return {"answer": answer, "citations": citations, "figures": figures}
