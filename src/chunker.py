"""
chunker.py — Hierarchical, context-enriched chunking of Paper objects.

Splits each Paper into Chunk records at two levels:
  - Level 1: top-level sections (heading depth 1).
  - Level 2: subsections (heading depth >= 2), prefixed with paper title
             and parent heading for context enrichment.

Long sections are split on natural paragraph boundaries (\\n\\n delimiters,
which come from LaTeX ltx_para structure preserved by the ar5iv parser)
rather than arbitrary character counts. A 1-paragraph overlap is used
between adjacent split chunks to preserve cross-paragraph context.

Three section-numbering conventions appear in this corpus:
  - Arabic:  '1Introduction' (depth 1), '1.1Background' (depth 2)
  - Roman:   'IIRelated Work' (depth 1), 'II-ASubtopic' / 'II.1Sub' (depth 2)
  - Letter:  'A.1Details' (depth 2), 'A-DAnalysis' (depth 2), '-AProofs' (depth 2)
  - Plain:   'Impact Statement' (no prefix — treated as depth 1)

Usage:
    from src.chunker import chunk_paper
    chunks = chunk_paper(paper)
"""

import re
from src.data import Chunk, Paper


def get_section_depth(heading: str) -> int:
    """
    Infer the section hierarchy depth from its heading string.

    Returns 1 for top-level sections, 2 for subsections.
    Depth-3+ headings (e.g. 'A.1.1Radial Parallelism') are clamped to 2.

    Args:
        heading: Raw heading string from a Section object.

    Returns:
        1 for a top-level section, 2 for a subsection.
    """
    # Arabic with dot: 1.1, 1.2.3 → depth 2
    if re.match(r"^\d+\.\d", heading):
        return 2

    # Arabic top-level: starts with a digit only → depth 1
    if re.match(r"^\d+", heading):
        return 1

    # Roman with separator: II-A, III-B, II.1, III.2 → depth 2
    if re.match(r"^[IVXLCDM]+-[A-Z]", heading):
        return 2
    if re.match(r"^[IVXLCDM]+\.\d", heading):
        return 2

    # Roman top-level: IIntroduction, IIRelated Work, IIIMethodology → depth 1
    # Must come after the separator checks above to avoid false matches.
    if re.match(r"^[IVXLCDM]+[A-Z\s]", heading):
        return 1

    # Letter appendix subsections: A.1, B.2, A-D, -A, -B
    if re.match(r"^[A-Z]\.\d", heading):
        return 2
    if re.match(r"^[A-Z]-[A-Z]", heading):
        return 2
    if re.match(r"^-[A-Z]", heading):
        return 2

    # Unnumbered headings ('Impact Statement', 'Conclusion', etc.) → top-level
    return 1


def group_paragraphs(text: str, max_chars: int = 2000) -> list[str]:
    """
    Split a section body into chunks using natural paragraph boundaries.

    Uses double-newline (\\n\\n) delimiters, which correspond to LaTeX
    paragraph boundaries preserved by the ar5iv HTML parser. This avoids
    arbitrary character-count splitting that could break mid-argument.

    A 1-paragraph overlap is applied between adjacent chunks so that
    context is not lost at split boundaries.

    Args:
        text: Section body text with \\n\\n-separated paragraphs.
        max_chars: Soft cap on chunk size in characters (~500 tokens at
                   ~4 chars/token). Defaults to 2000.

    Returns:
        List of text strings. Returns [text] unchanged if the text fits
        within max_chars or has no paragraph breaks.
    """
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]

    # No split needed — return the original text to avoid unnecessary copies
    if not paras or len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0

    for para in paras:
        if current_len + len(para) > max_chars and current:
            chunks.append("\n\n".join(current))
            # 1-paragraph overlap: carry the last paragraph into the next chunk
            current = [current[-1], para]
            current_len = len(current[0]) + len(para)
        else:
            current.append(para)
            current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def chunk_paper(paper: Paper) -> list[Chunk]:
    """
    Convert a Paper into a flat list of context-enriched Chunks.

    Iterates sections in document order, tracking the most recent
    top-level (depth-1) section as the parent context for subsections.

    Context prefixes are prepended to each chunk text before embedding:
      Level 1: "{title} | {heading}\\n\\n{text}"
      Level 2: "{title} | {parent_heading} | {heading}\\n\\n{text}"

    Sections with no text are skipped. Sections exceeding max_chars are
    split via group_paragraphs(), with each piece assigned a chunk_index.

    Args:
        paper: A structured Paper object (from src/data.py).

    Returns:
        Ordered list of Chunk objects, one per section (or split piece).
    """
    chunks: list[Chunk] = []
    current_parent: str = ""

    for section in paper.sections:
        if not section.text.strip():
            continue

        depth = get_section_depth(section.heading)

        if depth == 1:
            current_parent = section.heading
            prefix = f"{paper.title} | {section.heading}"
        else:
            if current_parent:
                prefix = f"{paper.title} | {current_parent} | {section.heading}"
            else:
                # Subsection appears before any top-level section (edge case)
                prefix = f"{paper.title} | {section.heading}"

        parts = group_paragraphs(section.text)

        for i, part in enumerate(parts):
            chunks.append(
                Chunk(
                    paper_id=paper.paper_id,
                    paper_title=paper.title,
                    level=min(depth, 2),
                    heading=section.heading,
                    parent_heading=current_parent if depth > 1 else "",
                    text=f"{prefix}\n\n{part}",
                    chunk_index=i,
                )
            )

    return chunks