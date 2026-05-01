"""Parse raw Arxiv JSON into structured Paper records."""

from dataclasses import dataclass, field
import json
import os

from bs4 import BeautifulSoup


@dataclass
class Section:
    heading: str
    text: str


@dataclass
class Figure:
    caption: str
    image_path: str = ""


@dataclass
class Paper:
    paper_id: str
    title: str
    abstract: str
    authors: list[str] = field(default_factory=list)
    date: str = ""
    url: str = ""
    sections: list[Section] = field(default_factory=list)
    figures: list[Figure] = field(default_factory=list)


@dataclass
class Chunk:
    """A text chunk produced by hierarchical section chunking."""
    paper_id: str
    paper_title: str
    level: int           # 1 = top-level section, 2 = subsection
    heading: str
    parent_heading: str  # empty for level-1 chunks
    text: str            # raw paragraph-group text (no context prefix)
    section_text: str    # full section body; used by late_chunk_encode
    section_idx: int     # 0-based section index within the paper
    chunk_index: int = 0


def parse_ar5iv_html(html: str, paper_id: str) -> tuple[list[Section], list[Figure]]:
    """Extract sections and figures from an ar5iv HTML page."""
    soup = BeautifulSoup(html, "html.parser")

    sections = []
    for section_el in soup.find_all(
        "section", class_=["ltx_section", "ltx_subsection"]
    ):
        heading_el = section_el.find(
            ["h2", "h3", "h4", "h5", "h6"], class_="ltx_title"
        )
        heading = heading_el.get_text(strip=True) if heading_el else "Untitled"

        # Direct-child paragraphs only — avoids duplication with nested subsections.
        paras = section_el.find_all("div", class_="ltx_para", recursive=False)
        text_parts = []
        for p in paras:
            text = p.get_text(separator=" ", strip=True)
            if text:
                text_parts.append(text)

        body = "\n\n".join(text_parts)
        if body:
            sections.append(Section(heading=heading, text=body))

    figures = []
    for fig_el in soup.find_all("figure", class_="ltx_figure"):
        caption_el = fig_el.find("figcaption", class_="ltx_caption")
        caption = caption_el.get_text(separator=" ", strip=True) if caption_el else ""

        img_el = fig_el.find("img")
        image_url = ""
        if img_el:
            src = img_el.get("src", "")
            if src:
                if src.startswith("http"):
                    image_url = src
                elif src.startswith("/"):
                    image_url = f"https://ar5iv.labs.arxiv.org{src}"
                else:
                    image_url = (
                        f"https://ar5iv.labs.arxiv.org/html/{paper_id}/{src}"
                    )

        if caption or image_url:
            figures.append(Figure(caption=caption, image_path=image_url))

    return sections, figures


def load_raw_papers(raw_dir: str) -> list[dict]:
    papers = []
    for filename in sorted(os.listdir(raw_dir)):
        if filename.endswith(".json"):
            filepath = os.path.join(raw_dir, filename)
            with open(filepath, "r") as f:
                papers.append(json.load(f))
    return papers


def parse_paper(raw: dict) -> Paper:
    return Paper(
        paper_id=raw["paper_id"],
        title=raw["title"],
        abstract=raw["abstract"],
        authors=raw.get("authors", []),
        date=raw.get("date", ""),
        url=raw.get("url", ""),
        sections=[
            Section(heading=s["heading"], text=s["text"])
            for s in raw.get("sections", [])
        ],
        figures=[
            Figure(caption=f["caption"], image_path=f.get("image_path", ""))
            for f in raw.get("figures", [])
        ],
    )


def load_corpus(processed_path: str) -> list[Paper]:
    with open(processed_path, "r") as f:
        corpus = json.load(f)
    return [parse_paper(raw) for raw in corpus]


def save_corpus(papers: list[Paper], processed_path: str) -> None:
    os.makedirs(os.path.dirname(processed_path), exist_ok=True)
    corpus = []
    for p in papers:
        corpus.append(
            {
                "paper_id": p.paper_id,
                "title": p.title,
                "abstract": p.abstract,
                "authors": p.authors,
                "date": p.date,
                "url": p.url,
                "sections": [
                    {"heading": s.heading, "text": s.text} for s in p.sections
                ],
                "figures": [
                    {"caption": f.caption, "image_path": f.image_path}
                    for f in p.figures
                ],
            }
        )
    with open(processed_path, "w") as f:
        json.dump(corpus, f, indent=2)
