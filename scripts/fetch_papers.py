"""
fetch_papers.py — Download papers from the Arxiv API.

Queries specified categories, downloads metadata (title, abstract, authors,
date, PDF URL), and saves raw JSON responses to data/raw/.

Usage:
    python scripts/fetch_papers.py
"""

import sys
import os

# Allow imports from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config


def fetch_papers():
    """Fetch papers from Arxiv API and save to data/raw/."""
    raise NotImplementedError


if __name__ == "__main__":
    fetch_papers()
