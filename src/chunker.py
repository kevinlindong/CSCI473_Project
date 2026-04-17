"""
chunker.py — Hierarchical chunking of Paper objects for late-chunking encoding.

Splits each Paper into Chunk records at two levels:
  - Level 1: top-level sections (heading depth 1).
  - Level 2: subsections (heading depth >= 2).

Each Chunk stores raw paragraph-group text (no context prefix). The context
prefix ("Title | Heading") is injected once per section at encode time in
build_embeddings.py, so every chunk in a section attends to title and heading
via the transformer's full-sequence attention — this is the core of late chunking.

Each Chunk also stores the full section body (section_text) and a 0-based
section index (section_idx) so build_embeddings.py can group chunks back to
their parent section for late_chunk_encode.

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

    No overlap is applied between chunks. Context is instead provided at
    encode time by prepending a single "Title | Heading" prefix to the full
    section text and using late chunking (token-level mean pooling), so
    every chunk's embedding already reflects full-section context without
    duplicating paragraph text.

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
            current = [para]
            current_len = len(para)
        else:
            current.append(para)
            current_len += len(para)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


def chunk_paper(paper: Paper) -> list[Chunk]:
    """
    Convert a Paper into a flat list of Chunks, one per paragraph group.

    Iterates sections in document order, tracking the most recent top-level
    (depth-1) section as the parent context for subsections.

    Each chunk stores:
      - text:         raw paragraph-group text (no prefix — prefix is injected
                      once per section at encode time for late chunking)
      - section_text: full section body, so build_embeddings.py can reconstruct
                      the prefixed full_text for late_chunk_encode
      - section_idx:  0-based index across non-empty sections within this paper,
                      used to group chunks back to their section

    Sections with no text are skipped. Sections exceeding max_chars are split
    via group_paragraphs(), with each piece assigned a chunk_index.

    Args:
        paper: A structured Paper object (from src/data.py).

    Returns:
        Ordered list of Chunk objects, one per paragraph group.
    """
    chunks: list[Chunk] = []
    current_parent: str = ""
    section_idx: int = 0

    for section in paper.sections:
        if not section.text.strip():
            continue

        depth = get_section_depth(section.heading)

        if depth == 1:
            current_parent = section.heading

        parts = group_paragraphs(section.text)

        for i, part in enumerate(parts):
            chunks.append(
                Chunk(
                    paper_id=paper.paper_id,
                    paper_title=paper.title,
                    level=min(depth, 2),
                    heading=section.heading,
                    parent_heading=current_parent if depth > 1 else "",
                    text=part,
                    section_text=section.text,
                    section_idx=section_idx,
                    chunk_index=i,
                )
            )

        section_idx += 1

    return chunks
