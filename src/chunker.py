"""Hierarchical chunking of Paper objects for late-chunking encoding.

Splits each Paper into Chunks at two levels (top-level sections and subsections).
Chunks store raw paragraph-group text; the "Title | Heading" context prefix is
injected once per section at encode time, so every chunk attends to title and
heading via the transformer's full-sequence attention.
"""

import re
from src.data import Chunk, Paper


def get_section_depth(heading: str) -> int:
    """Return 1 for top-level sections, 2 for subsections (depth-3+ clamps to 2)."""
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

    # Roman top-level: IIntroduction, IIRelated Work → depth 1.
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

    return 1


def group_paragraphs(text: str, max_chars: int = 2000) -> list[str]:
    """Split a section body at \\n\\n paragraph boundaries with no overlap.

    Context is provided at encode time via late chunking, not here.
    """
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]

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
    """Convert a Paper into a flat list of Chunks, one per paragraph group."""
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
