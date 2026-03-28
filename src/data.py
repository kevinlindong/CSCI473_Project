"""
data.py — Parse raw Arxiv JSON into structured Paper records.

Handles loading raw API responses, extracting structured fields
(title, abstract, sections, figures), and saving/loading the
processed corpus.
"""

from dataclasses import dataclass, field
import json
import os

import pandas as pd


@dataclass
class Section:
    """A section of a paper (e.g., Background, Methodology, Results)."""
    heading: str
    text: str


@dataclass
class Figure:
    """A figure from a paper with its caption and optional image path."""
    caption: str
    image_path: str = ""


@dataclass
class Paper:
    """A structured representation of an Arxiv paper."""
    paper_id: str
    title: str
    abstract: str
    authors: list[str] = field(default_factory=list)
    date: str = ""
    url: str = ""
    sections: list[Section] = field(default_factory=list)
    figures: list[Figure] = field(default_factory=list)


def load_raw_papers(raw_dir: str) -> list[dict]:
    """Load raw JSON files from the data/raw/ directory."""
    raise NotImplementedError


def parse_paper(raw: dict) -> Paper:
    """Convert a raw Arxiv API response dict into a structured Paper."""
    raise NotImplementedError


def load_corpus(processed_path: str) -> list[Paper]:
    """Load the processed paper corpus from disk."""
    raise NotImplementedError


def save_corpus(papers: list[Paper], processed_path: str) -> None:
    """Save the processed paper corpus to disk."""
    raise NotImplementedError
