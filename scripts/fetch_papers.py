"""
fetch_papers.py — Download papers from the Arxiv API and enrich via ar5iv.

Phase 1: Query arXiv API for recent papers in configured categories.
Phase 2: Fetch ar5iv HTML for each paper to extract sections and figures.
Saves one JSON file per paper to data/raw/.

Usage:
    python scripts/fetch_papers.py
"""

import json
import logging
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import arxiv
import requests

# Allow imports from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import config
from src.data import parse_ar5iv_html

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
)
logger = logging.getLogger(__name__)


def discover_papers() -> list[dict]:
    """Query arXiv API for papers in the last week of ar5iv coverage.

    Uses AR5IV_END_DATE as the upper bound and ARXIV_FETCH_DAYS to compute
    the lower bound, since ar5iv's corpus has a fixed cutoff.

    Returns a de-duplicated list of metadata dicts sorted by date descending.
    """
    end_date = datetime.fromisoformat(config.AR5IV_END_DATE).replace(
        tzinfo=timezone.utc
    )
    start_date = end_date - timedelta(days=config.ARXIV_FETCH_DAYS)

    # Build query with date range so the API only returns papers in our window.
    # arXiv submittedDate format: YYYYMMDDHHMM
    date_from = start_date.strftime("%Y%m%d0000")
    date_to = end_date.strftime("%Y%m%d2359")
    cat_query = " OR ".join(f"cat:{cat}" for cat in config.ARXIV_CATEGORIES)
    query = f"({cat_query}) AND submittedDate:[{date_from} TO {date_to}]"
    logger.info(
        "arXiv query: %s (%s to %s)", query, start_date.date(), end_date.date()
    )

    search = arxiv.Search(
        query=query,
        max_results=config.MAX_PAPERS,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )
    client = arxiv.Client(page_size=100, delay_seconds=3.0, num_retries=3)

    papers = []
    seen_ids: set[str] = set()

    for result in client.results(search):
        published = result.published.replace(tzinfo=timezone.utc)

        # Skip papers newer than ar5iv's coverage cutoff
        if published > end_date:
            continue

        # Early termination once we pass the start of our window
        if published < start_date:
            break

        # Strip version suffix: "2310.06825v1" -> "2310.06825"
        short_id = result.get_short_id()
        paper_id = short_id.rsplit("v", 1)[0]

        if paper_id in seen_ids:
            continue
        seen_ids.add(paper_id)

        papers.append(
            {
                "paper_id": paper_id,
                "title": result.title,
                "abstract": result.summary,
                "authors": [a.name for a in result.authors],
                "date": result.published.isoformat(),
                "url": result.entry_id,
                "categories": result.categories,
                "primary_category": result.primary_category,
                "sections": [],
                "figures": [],
                "ar5iv_success": False,
            }
        )

    logger.info("Discovered %d papers from arXiv API", len(papers))
    return papers


def enrich_paper(paper: dict) -> dict:
    """Fetch ar5iv HTML and extract sections + figures for a single paper.

    On failure, the paper is returned unchanged (abstract-only, ar5iv_success=False).
    """
    paper_id = paper["paper_id"]
    url = f"{config.AR5IV_BASE_URL}/{paper_id}"

    try:
        resp = requests.get(url, timeout=30)

        # ar5iv redirects to arxiv.org/abs/ when conversion is unavailable
        if "ar5iv" not in resp.url:
            logger.warning("%s: ar5iv redirected (no HTML available)", paper_id)
            return paper

        if resp.status_code != 200:
            logger.warning("%s: ar5iv returned status %d", paper_id, resp.status_code)
            return paper

        sections, figures = parse_ar5iv_html(resp.text, paper_id)
        paper["sections"] = [
            {"heading": s.heading, "text": s.text} for s in sections
        ]
        paper["figures"] = [
            {"caption": f.caption, "image_path": f.image_path} for f in figures
        ]
        paper["ar5iv_success"] = True
        logger.info(
            "%s: extracted %d sections, %d figures",
            paper_id,
            len(sections),
            len(figures),
        )

    except Exception as exc:
        logger.warning("%s: ar5iv fetch failed — %s", paper_id, exc)

    return paper


def fetch_papers():
    """Fetch papers from Arxiv API, enrich via ar5iv, and save to data/raw/."""
    os.makedirs(config.RAW_DIR, exist_ok=True)

    papers = discover_papers()
    if not papers:
        logger.info("No papers found in the date range.")
        return

    enriched_count = 0
    skipped_count = 0

    for i, paper in enumerate(papers):
        save_path = os.path.join(config.RAW_DIR, f"{paper['paper_id']}.json")

        # Incremental: skip papers already fetched
        if os.path.exists(save_path):
            skipped_count += 1
            continue

        logger.info(
            "Enriching %d/%d: %s", i + 1, len(papers), paper["paper_id"]
        )
        time.sleep(config.FETCH_DELAY_SECONDS)
        paper = enrich_paper(paper)

        with open(save_path, "w") as f:
            json.dump(paper, f, indent=2)

        if paper["ar5iv_success"]:
            enriched_count += 1

    total_new = len(papers) - skipped_count
    logger.info(
        "Done. %d papers total, %d skipped (cached), %d new, %d enriched via ar5iv",
        len(papers),
        skipped_count,
        total_new,
        enriched_count,
    )


if __name__ == "__main__":
    fetch_papers()
