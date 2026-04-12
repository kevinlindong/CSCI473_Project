"""Tests for hierarchical chunking — get_section_depth, group_paragraphs, chunk_paper."""

import pytest

from src.chunker import chunk_paper, get_section_depth, group_paragraphs
from src.data import Figure, Paper, Section


# ---------------------------------------------------------------------------
# get_section_depth
# ---------------------------------------------------------------------------

class TestGetSectionDepth:
    def test_arabic_top_level(self):
        assert get_section_depth("1Introduction") == 1
        assert get_section_depth("2Related Work") == 1
        assert get_section_depth("10Conclusion") == 1

    def test_arabic_subsection(self):
        assert get_section_depth("1.1Background") == 2
        assert get_section_depth("2.3Experiments") == 2
        assert get_section_depth("1.2.3Deep Nest") == 2  # clamped to 2

    def test_roman_top_level(self):
        assert get_section_depth("IIntroduction") == 1
        assert get_section_depth("IIRelated Work") == 1
        assert get_section_depth("IIIMethodology") == 1

    def test_roman_subsection(self):
        assert get_section_depth("II-ASubtopic") == 2
        assert get_section_depth("III-BAnalysis") == 2
        assert get_section_depth("II.1Details") == 2

    def test_letter_appendix_subsection(self):
        assert get_section_depth("A.1Details") == 2
        assert get_section_depth("B.2Results") == 2
        assert get_section_depth("A-DAnalysis") == 2
        assert get_section_depth("-AProofs") == 2

    def test_plain_text_top_level(self):
        assert get_section_depth("Impact Statement") == 1
        assert get_section_depth("Conclusion") == 1
        assert get_section_depth("Acknowledgements") == 1


# ---------------------------------------------------------------------------
# group_paragraphs
# ---------------------------------------------------------------------------

class TestGroupParagraphs:
    def test_short_text_unchanged(self):
        text = "A short paragraph."
        assert group_paragraphs(text) == [text]

    def test_no_paragraph_breaks_unchanged(self):
        # Even if long, no \n\n means nothing to split on
        text = "x" * 3000
        assert group_paragraphs(text) == [text]

    def test_splits_when_over_limit(self):
        para = "x" * 1100
        text = f"{para}\n\n{para}"
        parts = group_paragraphs(text)
        assert len(parts) == 2

    def test_one_paragraph_overlap(self):
        # With 3 paragraphs that each exceed half the limit,
        # the last paragraph of chunk N should appear as the first of chunk N+1
        para = "y" * 1100
        text = f"{para}\n\n{para}\n\n{para}"
        parts = group_paragraphs(text)
        # The overlap means the second chunk starts with the last para of the first
        first_chunk_last_para  = parts[0].split("\n\n")[-1]
        second_chunk_first_para = parts[1].split("\n\n")[0]
        assert first_chunk_last_para == second_chunk_first_para

    def test_empty_paragraphs_stripped(self):
        text = "Hello\n\n\n\n\n\nWorld"
        parts = group_paragraphs(text)
        # Both non-empty paragraphs should appear somewhere in the output
        combined = "\n\n".join(parts)
        assert "Hello" in combined
        assert "World" in combined

    def test_three_paragraphs_fit_in_one(self):
        # Three short paragraphs — should stay as one chunk
        text = "A\n\nB\n\nC"
        parts = group_paragraphs(text)
        assert len(parts) == 1


# ---------------------------------------------------------------------------
# chunk_paper
# ---------------------------------------------------------------------------

def _make_paper(**kwargs) -> Paper:
    defaults = dict(paper_id="p001", title="Test Paper", abstract="An abstract.")
    defaults.update(kwargs)
    return Paper(**defaults)


class TestChunkPaper:
    def test_empty_sections_returns_no_chunks(self):
        paper = _make_paper(sections=[])
        assert chunk_paper(paper) == []

    def test_skips_sections_with_empty_text(self):
        paper = _make_paper(sections=[
            Section(heading="1Intro", text=""),
            Section(heading="2Method", text="Some content here."),
        ])
        chunks = chunk_paper(paper)
        assert len(chunks) == 1
        assert chunks[0].heading == "2Method"

    def test_level1_context_prefix(self):
        paper = _make_paper(sections=[
            Section(heading="1Introduction", text="Hello world."),
        ])
        chunks = chunk_paper(paper)
        assert len(chunks) == 1
        assert chunks[0].text.startswith("Test Paper | 1Introduction\n\n")

    def test_level2_context_prefix_includes_parent(self):
        paper = _make_paper(sections=[
            Section(heading="1Introduction", text="Top level."),
            Section(heading="1.1Background", text="Subsection content."),
        ])
        chunks = chunk_paper(paper)
        assert len(chunks) == 2
        assert chunks[1].text.startswith("Test Paper | 1Introduction | 1.1Background\n\n")

    def test_level2_without_prior_parent(self):
        # Subsection appears before any top-level section (edge case)
        paper = _make_paper(sections=[
            Section(heading="1.1Orphan", text="Orphan subsection."),
        ])
        chunks = chunk_paper(paper)
        assert len(chunks) == 1
        assert chunks[0].text.startswith("Test Paper | 1.1Orphan\n\n")

    def test_chunk_fields_populated(self):
        paper = _make_paper(sections=[
            Section(heading="1Intro", text="Some text."),
        ])
        c = chunk_paper(paper)[0]
        assert c.paper_id    == "p001"
        assert c.paper_title == "Test Paper"
        assert c.level       == 1
        assert c.heading     == "1Intro"
        assert c.parent_heading == ""
        assert c.chunk_index == 0

    def test_long_section_produces_multiple_chunks(self):
        para  = "word " * 400          # ~2000 chars per para
        text  = f"{para}\n\n{para}\n\n{para}"
        paper = _make_paper(sections=[
            Section(heading="1Method", text=text),
        ])
        chunks = chunk_paper(paper)
        assert len(chunks) > 1
        for i, c in enumerate(chunks):
            assert c.chunk_index == i

    def test_parent_heading_tracks_across_subsections(self):
        paper = _make_paper(sections=[
            Section(heading="1Intro",      text="Intro text."),
            Section(heading="1.1Sub",      text="Sub text."),
            Section(heading="2Method",     text="Method text."),
            Section(heading="2.1Details",  text="Details text."),
        ])
        chunks = chunk_paper(paper)
        assert chunks[1].parent_heading == "1Intro"
        assert chunks[3].parent_heading == "2Method"

    def test_chunk_order_matches_section_order(self):
        paper = _make_paper(sections=[
            Section(heading="1A", text="First."),
            Section(heading="2B", text="Second."),
            Section(heading="3C", text="Third."),
        ])
        chunks = chunk_paper(paper)
        headings = [c.heading for c in chunks]
        assert headings == ["1A", "2B", "3C"]
