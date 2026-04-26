"""
llm.py — LLM text generation for two features.

1. Cluster labeling: generate_cluster_label(titles) takes a handful of paper
   titles representative of a cluster and returns a short topic name via a
   small instruction-tuned causal LM (Qwen2.5-1.5B-Instruct by default).

2. RAG answer generation: build_context() / generate_answer() compose a
   minimal retrieval-augmented generation pipeline using the same underlying
   model.

Both features share a lazy-loaded, module-cached AutoModelForCausalLM + tokenizer
so imports are free until the first call actually needs the model.

History: a previous iteration used flan-T5-base via AutoModelForSeq2SeqLM. At 250M
params it was prone to either single-word or extractively-copied outputs, so we
switched to a modern instruction-tuned causal LM with chat templates.
"""

import os
import re
from typing import Optional

import config


_TOKENIZER = None
_MODEL = None
_OR_CLIENT = None
_SCOOT_SYSTEM_PROMPT: Optional[str] = None


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
        # Prefer Apple MPS (Metal) on Apple silicon — orders of magnitude faster
        # than CPU for small LMs. Falls back to float32/CPU otherwise.
        if torch.cuda.is_available():
            device, dtype = "cuda", torch.float16
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            device, dtype = "mps", torch.float16
        else:
            device, dtype = "cpu", torch.float32
        _MODEL = AutoModelForCausalLM.from_pretrained(name, dtype=dtype)
        # MPS has a 4 GB per-NDArray ceiling; Qwen2.5-1.5B (~3 GB float16)
        # exceeds it during the attention forward pass and causes SIGABRT.
        # Check weight bytes after loading and fall back to CPU when unsafe.
        if device == "mps":
            param_bytes = sum(p.numel() * p.element_size() for p in _MODEL.parameters())
            if param_bytes > 2 * 2**30:  # >2 GB weights → too close to the 4 GB limit
                device = "cpu"
                _MODEL = _MODEL.float()  # float16 has poor CPU perf; convert in-place
        _MODEL.to(device)
        _MODEL.eval()
    return _TOKENIZER, _MODEL


def _chat_generate(
    messages: list[dict],
    max_new_tokens: int,
    model_name: Optional[str] = None,
    *,
    force_local: bool = False,
) -> str:
    """
    Provider-routing entry point. Dispatches on config.LLM_PROVIDER unless
    force_local=True (used by cluster labeling so the offline pipeline never
    accidentally hits the API).
    """
    provider = "local" if force_local else config.LLM_PROVIDER
    if provider == "openrouter":
        return _openrouter_generate(messages, max_new_tokens, model_name)
    return _local_generate(messages, max_new_tokens, model_name)


def _local_generate(
    messages: list[dict],
    max_new_tokens: int,
    model_name: Optional[str] = None,
) -> str:
    """
    Greedy generation over a chat-template'd prompt using the local Qwen model.
    Returns only the assistant's new tokens (not the input).
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


def _openrouter_generate(
    messages: list[dict],
    max_new_tokens: int,
    model_name: Optional[str] = None,
) -> str:
    """
    OpenAI-compatible call to OpenRouter. Client is module-cached so we pay
    construction cost once per process.
    """
    global _OR_CLIENT
    if _OR_CLIENT is None:
        from openai import OpenAI
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise RuntimeError(
                "LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set. "
                "Add it to .env or export it in your shell."
            )
        _OR_CLIENT = OpenAI(base_url=config.OPENROUTER_BASE_URL, api_key=api_key)

    resp = _OR_CLIENT.chat.completions.create(
        model=model_name or config.OPENROUTER_MODEL,
        messages=messages,
        max_tokens=max_new_tokens,
        temperature=config.OPENROUTER_TEMPERATURE,
    )
    return (resp.choices[0].message.content or "").strip()


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
    # Cluster labeling runs offline in compute_topic_graph.py and works fine on
    # the local 1.5B Qwen — pin to local so the offline pipeline never burns
    # API credit when LLM_PROVIDER=openrouter.
    raw = _chat_generate(messages, max_new_tokens=max_new_tokens, force_local=True)

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
                "Answer the user's question using only the provided context.\n\n"
                "Citation rules:\n"
                "- Cite sources as [1], [2], etc., placed at the END of the "
                "sentence they support, immediately before the period (e.g. "
                "\"...used for image segmentation [3].\").\n"
                "- Never put a citation at the start of a sentence or inside "
                "a heading.\n"
                "- Group multiple citations like [1][2] when several sources "
                "support the same claim.\n\n"
                "If the context does not answer the question, say so plainly."
            ),
        },
        {
            "role": "user",
            "content": f"Context:\n{context}\n\nQuestion: {query}",
        },
    ]
    return _chat_generate(messages, max_new_tokens=1024, model_name=model_name)


def _load_scoot_prompt() -> str:
    global _SCOOT_SYSTEM_PROMPT
    if _SCOOT_SYSTEM_PROMPT is None:
        path = os.path.join(os.path.dirname(__file__), "qwen_prompt", "qwen_prompt.txt")
        with open(path, encoding="utf-8") as f:
            _SCOOT_SYSTEM_PROMPT = f.read().strip()
    return _SCOOT_SYSTEM_PROMPT


# Detects raw LaTeX produced by the small model when it skipped the INSERT_BLOCK tag.
_RAW_LATEX_RE = re.compile(
    r"(\\begin\{(?:equation|align|gather|multline)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline)\*?\})"
    r"|(\\\[[\s\S]*?\\\])"
    r"|(\\\([\s\S]*?\\\))"
    r"|(\$\$[\s\S]*?\$\$)"
)
# Markdown fence blocks (```latex ... ``` or plain ``` ... ```).
_MD_FENCE_RE = re.compile(r"```(?:latex|tex)?\n?([\s\S]*?)```", re.IGNORECASE)
_INSERT_INTENT_RE = re.compile(r"\b(insert|add|write|paste|put|append)\b", re.IGNORECASE)
_HEADING_INTENT_RE = re.compile(r"\b(heading|section\s+title|section\s+called|section\s+named)\b", re.IGNORECASE)
# Placement phrases: "after the conclusion section", "before references", "at the top",
# "under the date section", "below the abstract", etc.
_POSITION_AFTER_RE = re.compile(
    r"\b(?:after|under|below|underneath|right\s+after|right\s+below|right\s+under)"
    r"\s+(?:the\s+)?"
    r"([\w\-]+(?:\s+[\w\-]+){0,3}?)"
    r"(?:\s+(?:section|block|part|heading))?\b",
    re.IGNORECASE,
)
_POSITION_BEFORE_RE = re.compile(
    r"\b(?:before|above|right\s+before|right\s+above)"
    r"\s+(?:the\s+)?"
    r"([\w\-]+(?:\s+[\w\-]+){0,3}?)"
    r"(?:\s+(?:section|block|part|heading))?\b",
    re.IGNORECASE,
)
_POSITION_END_RE = re.compile(r"\bat\s+the\s+(?:very\s+)?(?:end|bottom)\b", re.IGNORECASE)
_POSITION_START_RE = re.compile(r"\bat\s+the\s+(?:very\s+)?(?:top|start|beginning)\b", re.IGNORECASE)


# A small library of common formulas used when the small model fails to produce
# any raw LaTeX. Keys are matched as substrings against the user's message.
_FORMULA_LIBRARY: list[tuple[tuple[str, ...], str]] = [
    (("navier-stokes", "navier stokes"),
     r"\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla) \mathbf{u} = -\frac{1}{\rho} \nabla p + \nu \nabla^2 \mathbf{u} + \mathbf{f}"),
    (("quadratic formula", "quadratic equation"),
     r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}"),
    (("pythagorean",),
     r"a^2 + b^2 = c^2"),
    (("euler's identity", "eulers identity", "euler identity"),
     r"e^{i\pi} + 1 = 0"),
    (("mass-energy", "e=mc", "e = mc", "einstein's", "einsteins"),
     r"E = mc^2"),
    (("schrödinger", "schrodinger"),
     r"i\hbar \frac{\partial}{\partial t} \Psi = \hat{H} \Psi"),
    (("maxwell",),
     r"\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}"),
    (("fourier transform",),
     r"\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x) e^{-2\pi i x \xi}\,dx"),
    (("bayes",),
     r"P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}"),
    (("attention", "self-attention", "scaled dot-product"),
     r"\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}}\right) V"),
]
# Hallucinated wrapper tags the model emits when confused (e.g. [user]...[/user]).
_HALLUCINATED_TAG_RE = re.compile(
    r"\[/?(?:user|assistant|system|human|response|answer)\]",
    re.IGNORECASE,
)
_OPEN_INTENT_RE = re.compile(
    r"^\s*(?:please\s+|can\s+you\s+|could\s+you\s+|hey\s+)?"
    # Verbs that mean "find and open". `find` and `look\s+(?:for|up)` get
    # disambiguated below — they only count as open-intent when the object
    # of the search is a draft/paper noun. "find papers about contrastive
    # learning" goes to corpus search instead via _SEARCH_INTENT_RE.
    r"(?:open|load|show(?:\s+me)?|pull\s+up|bring\s+up|"
    r"find(?:\s+me)?|locate|look\s+(?:for|up)|"
    r"go\s+to|jump\s+to|switch\s+to|navigate\s+to|"
    r"where(?:'s|\s+is)|"
    r"i\s+want\s+(?:to\s+open\s+|to\s+see\s+)?|"
    r"let'?s\s+(?:open\s+|look\s+at\s+|see\s+))\s+"
    r"(?:my\s+|the\s+|that\s+|a\s+|an\s+)?"
    r"(.+?)"
    # Trailing noun phrase like "paper", "research paper", "draft", etc. — stripped.
    r"(?:\s+(?:research|academic|conference|journal|seminar|review)\s+(?:paper|draft|document|file|article|manuscript|thesis))?"
    r"(?:\s+(?:paper|draft|document|file|article|manuscript|thesis|note|notebook))?"
    r"\s*[\.\?!]*\s*$",
    re.IGNORECASE,
)
_SEARCH_INTENT_RE = re.compile(
    r"^\s*(?:what\s+(?:does|do)\s+the\s+corpus\s+say\s+about|"
    r"search\s+(?:the\s+)?corpus\s+for|"
    r"find\s+(?:papers|sources)\s+(?:about|on)|"
    r"look\s+up)\s+(.+?)\s*[\.\?!]*\s*$",
    re.IGNORECASE,
)


def _normalize_inline_math(latex: str) -> str:
    """Convert \\[...\\], \\(...\\), or $$...$$ to \\begin{equation}...\\end{equation}."""
    s = latex.strip()
    if s.startswith("\\[") and s.endswith("\\]"):
        inner = s[2:-2].strip()
        return f"\\begin{{equation}}{inner}\\end{{equation}}"
    if s.startswith("\\(") and s.endswith("\\)"):
        inner = s[2:-2].strip()
        return f"\\begin{{equation}}{inner}\\end{{equation}}"
    if s.startswith("$$") and s.endswith("$$"):
        inner = s[2:-2].strip()
        return f"\\begin{{equation}}{inner}\\end{{equation}}"
    return s


def _strip_md_fences(text: str) -> str:
    """Pull LaTeX out of any ```latex ... ``` markdown code fences."""
    def repl(m: re.Match) -> str:
        return m.group(1).strip()
    return _MD_FENCE_RE.sub(repl, text)


def _strip_hallucinated_tags(text: str) -> str:
    """Remove fake role tags like [user]...[/user] the small model sometimes emits."""
    return _HALLUCINATED_TAG_RE.sub("", text).strip()


def _lookup_formula(user_message: str) -> Optional[str]:
    """Return canonical LaTeX for a known formula name mentioned in the user message."""
    msg = user_message.lower()
    for keys, latex in _FORMULA_LIBRARY:
        if any(k in msg for k in keys):
            return latex
    return None


def _has_action_tag(text: str) -> bool:
    # INSERT_BLOCK carries attributes, so allow optional attribute string after the name.
    return bool(re.search(r"\[(?:OPEN_DRAFT\]|SEARCH_CORPUS\]|INSERT_BLOCK[\s\]])", text))


def _detect_position(user_message: str) -> Optional[str]:
    """Map natural-language placement phrases to a position string the
    EditorBridge understands: "end", "start", "after:<section>", "before:<section>"."""
    m = _POSITION_AFTER_RE.search(user_message)
    if m:
        return f"after:{m.group(1).strip().lower()}"
    m = _POSITION_BEFORE_RE.search(user_message)
    if m:
        return f"before:{m.group(1).strip().lower()}"
    if _POSITION_END_RE.search(user_message):
        return "end"
    if _POSITION_START_RE.search(user_message):
        return "start"
    return None


def _inject_position_attr(tag_block: str, position: str) -> str:
    """Insert position="..." into an [INSERT_BLOCK ...] opener if not present."""
    def repl(match: re.Match) -> str:
        attrs = match.group(1)
        if 'position=' in attrs:
            return match.group(0)
        return f"[INSERT_BLOCK{attrs} position=\"{position}\"]"
    return re.sub(r"\[INSERT_BLOCK([^\]]*)\]", repl, tag_block, count=1)


def _strip_math_delimiters_inside_env(s: str) -> str:
    """Inside \\begin{equation/align/...}...\\end{...}, the model sometimes
    leaves stray \\[, \\], \\(, \\) delimiters or prose. Drop the delimiters."""
    pattern = re.compile(
        r"(\\begin\{(?:equation|align|gather|multline)\*?\})([\s\S]*?)(\\end\{(?:equation|align|gather|multline)\*?\})"
    )
    def repl(m: re.Match) -> str:
        inner = m.group(2)
        inner = re.sub(r"\\\[|\\\]|\\\(|\\\)", "", inner)
        return f"{m.group(1)}{inner}{m.group(3)}"
    return pattern.sub(repl, s)


def _clean_latex_content(content: str) -> str:
    """
    Sanitize raw LaTeX produced by the small model: strip stray closers, balance
    \\begin/\\end pairs, and normalize \\[...\\] / $$...$$ to equation env.
    """
    s = content.strip()
    # Drop a trailing \end{equation} that has no matching \begin{equation}.
    if s.endswith("\\end{equation}") and "\\begin{equation}" not in s:
        s = s[: -len("\\end{equation}")].rstrip()
    if s.endswith("\\end{align}") and "\\begin{align}" not in s:
        s = s[: -len("\\end{align}")].rstrip()
    s = _normalize_inline_math(s)
    s = _strip_math_delimiters_inside_env(s)
    return s


def _clean_latex_tags(reply: str) -> str:
    """Apply _clean_latex_content to every INSERT_BLOCK type="latex" body."""
    pattern = re.compile(
        r'(\[INSERT_BLOCK[^\]]*type="latex"[^\]]*\])([\s\S]*?)(\[/INSERT_BLOCK\])'
    )
    def repl(m: re.Match) -> str:
        return f"{m.group(1)}{_clean_latex_content(m.group(2))}{m.group(3)}"
    return pattern.sub(repl, reply)


def _postprocess_scoot_reply(reply: str, user_message: str) -> str:
    """
    The 1.5B model often produces raw content (LaTeX, a heading line) or
    hallucinates fake tags ([user]Opened...[/user]) instead of emitting the
    real action tags the frontend needs. When the user's intent is clearly
    one of the three actions, wrap the appropriate target here regardless of
    what the model produced.
    """
    # Strip any hallucinated [user]/[assistant] wrapper tags first.
    reply = _strip_hallucinated_tags(reply)

    insert_intent = bool(_INSERT_INTENT_RE.search(user_message))
    heading_intent = bool(_HEADING_INTENT_RE.search(user_message))
    open_match = _OPEN_INTENT_RE.match(user_message)
    search_match = _SEARCH_INTENT_RE.match(user_message)
    position = _detect_position(user_message)

    # Corpus-search intent fires first: phrases like "find papers about X"
    # also match the open-paper regex (since it now accepts "find"), and
    # corpus search is the more specific reading.
    if search_match and not _has_action_tag(reply):
        query = search_match.group(1).strip().strip('"\'')
        if query:
            return f"[SEARCH_CORPUS]{query}[/SEARCH_CORPUS]"

    # Open-paper intent — derive the title directly from the user message.
    # The model frequently hallucinates tags here, so prefer the user's words.
    if open_match and not _has_action_tag(reply):
        title = open_match.group(1).strip().strip('"\'')
        # Ignore overly generic targets like "draft" or "paper" alone.
        if title and title.lower() not in {"draft", "paper", "document", "file", "note", "notes"}:
            return f"[OPEN_DRAFT]{title}[/OPEN_DRAFT]"

    # When the user's intent is to insert LaTeX, prefer producing a clean
    # INSERT_BLOCK type="latex" tag from raw LaTeX in the reply — even if the
    # model already emitted some tags (it often emits a confused mix of a
    # markdown fence + a half-formed type="text" block when nervous).
    if insert_intent:
        cleaned_reply = _strip_md_fences(reply)
        match = _RAW_LATEX_RE.search(cleaned_reply)
        if match:
            latex = _normalize_inline_math(match.group(0))
            pos_attr = f' position="{position}"' if position else ""
            return f'[INSERT_BLOCK type="latex"{pos_attr}]{latex}[/INSERT_BLOCK]'
        # No raw LaTeX — fall back to the canonical formula library.
        canonical = _lookup_formula(user_message)
        if canonical:
            pos_attr = f' position="{position}"' if position else ""
            latex = f"\\begin{{equation}}{canonical}\\end{{equation}}"
            return f'[INSERT_BLOCK type="latex"{pos_attr}]{latex}[/INSERT_BLOCK]'

    # Already has tags — clean LaTeX content and optionally inject position.
    if _has_action_tag(reply):
        cleaned = _clean_latex_tags(reply)
        if position and "[INSERT_BLOCK" in cleaned:
            cleaned = _inject_position_attr(cleaned, position)
        return cleaned

    # Heading intent: wrap a short non-LaTeX reply as a heading block.
    if heading_intent and not _RAW_LATEX_RE.search(reply):
        candidate = reply.strip().splitlines()[0].strip().strip('"\'')
        if 1 <= len(candidate.split()) <= 8:
            pos_attr = f' position="{position}"' if position else ""
            return f'[INSERT_BLOCK type="heading"{pos_attr}]{candidate}[/INSERT_BLOCK]'

    return reply


def generate_scoot_reply(
    message: str,
    history: Optional[list[dict]] = None,
    max_new_tokens: int = 160,
    model_name: Optional[str] = None,
) -> str:
    """
    Run a chat turn for the scoot agent. `history` is a list of {role, content}
    dicts (roles: 'user' | 'assistant'). The qwen_prompt.txt is prepended as
    the system prompt.
    """
    messages: list[dict] = [{"role": "system", "content": _load_scoot_prompt()}]
    if history:
        for msg in history[-12:]:  # cap history to keep prompt under context
            role = msg.get("role")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})
    raw = _chat_generate(messages, max_new_tokens=max_new_tokens, model_name=model_name)
    return _postprocess_scoot_reply(raw, message)
