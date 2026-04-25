"""
fetch_papers.py — Download papers from the Arxiv API and enrich via ar5iv.

Target-seeking: walks backward in one-month slices from AR5IV_END_DATE and
keeps enriching until `config.ARXIV_TARGET_ENRICHED` papers exist on disk
(or `config.ARXIV_FETCH_MAX_MONTHS_BACK` months is exhausted). Resumable —
skips any paper whose JSON is already on disk.

Phase 1: Query arXiv API for a given (category, month) slice.
Phase 2: Fetch ar5iv HTML for each paper to extract sections and figures.
Saves one JSON file per paper to data/raw/enriched/.

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


def _month_floor(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def discover_papers_in_month(
    start_date: datetime, end_date: datetime
) -> list[dict]:
    """Query arXiv API for papers in a single [start_date, end_date] slice.

    end_date is clamped at AR5IV_END_DATE upstream; start_date is typically
    the first day of the month containing end_date (or the month before).

    Returns a de-duplicated list of metadata dicts sorted by date descending.
    """
    date_from = start_date.strftime("%Y%m%d0000")
    date_to = end_date.strftime("%Y%m%d2359")
    cat_query = " OR ".join(f"cat:{cat}" for cat in config.ARXIV_CATEGORIES)
    query = f"({cat_query}) AND submittedDate:[{date_from} TO {date_to}]"
    logger.info(
        "arXiv query (%s to %s): %d cats, max %d results",
        start_date.date(),
        end_date.date(),
        len(config.ARXIV_CATEGORIES),
        config.ARXIV_MAX_RESULTS_PER_QUERY,
    )

    search = arxiv.Search(
        query=query,
        max_results=config.ARXIV_MAX_RESULTS_PER_QUERY,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )
    client = arxiv.Client(page_size=100, delay_seconds=3.0, num_retries=3)

    papers = []
    seen_ids: set[str] = set()

    for result in client.results(search):
        published = result.published.replace(tzinfo=timezone.utc)

        if published > end_date:
            continue
        if published < start_date:
            break

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

    logger.info(
        "Discovered %d papers in %s to %s",
        len(papers),
        start_date.date(),
        end_date.date(),
    )
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

        # Require section text — figures-only papers contribute nothing to
        # text chunking / retrieval / RAG
        if not sections:
            logger.warning("%s: ar5iv returned HTML but no parseable sections", paper_id)
            return paper

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


class Ar5ivSource:
    """Discover via the arXiv API, enrich via ar5iv HTML scraping.

    Today's only Source. Future ArxivS3Source / SemanticScholarSource would
    implement the same .discover(start, end) -> list[dict] and .enrich(paper)
    -> dict surface, so fetch_papers() can swap them via --source.
    """

    name = "ar5iv"

    def discover(self, start_date, end_date) -> list[dict]:
        return discover_papers_in_month(start_date, end_date)

    def enrich(self, paper: dict) -> dict:
        return enrich_paper(paper)


SOURCES = {Ar5ivSource.name: Ar5ivSource}


def _count_enriched_on_disk() -> int:
    if not os.path.isdir(config.RAW_DIR):
        return 0
    return sum(1 for f in os.listdir(config.RAW_DIR) if f.endswith(".json"))


def _invalidate_papers_json() -> None:
    """Remove stale processed/papers.json so compute_topic_graph.py rebuilds it."""
    papers_json = os.path.join(config.PROCESSED_DIR, "papers.json")
    if os.path.exists(papers_json):
        os.remove(papers_json)
        logger.info(
            "Removed stale %s; compute_topic_graph.py will rebuild it.",
            papers_json,
        )


def fetch_papers(source_name: str = "ar5iv"):
    """Fetch broad-ML arXiv papers, enrich via the chosen source, save to
    data/raw/enriched/.

    Walks backward in one-month slices from AR5IV_END_DATE, streaming each
    discovered paper through the source's enrich() and saving successes to
    disk. Stops when ARXIV_TARGET_ENRICHED JSONs exist on disk, or when
    ARXIV_FETCH_MAX_MONTHS_BACK months have been exhausted.
    """
    if source_name not in SOURCES:
        raise SystemExit(
            f"Unknown source '{source_name}'. Available: {sorted(SOURCES)}"
        )
    source = SOURCES[source_name]()
    logger.info("Using source: %s", source.name)

    os.makedirs(config.RAW_DIR, exist_ok=True)

    starting_count = _count_enriched_on_disk()
    target = config.ARXIV_TARGET_ENRICHED
    logger.info(
        "Starting fetch: %d enriched on disk, target=%d, max_months_back=%d",
        starting_count,
        target,
        config.ARXIV_FETCH_MAX_MONTHS_BACK,
    )

    if starting_count >= target:
        logger.info("Target already met — nothing to do.")
        return

    end_cursor = datetime.fromisoformat(config.AR5IV_END_DATE).replace(
        tzinfo=timezone.utc, hour=23, minute=59, second=59
    )
    # ar5iv indexes by arxiv YYMM announcement prefix; anything later than
    # AR5IV_END_DATE's month is guaranteed to redirect. Pre-filter to avoid
    # burning 3s per paper on certain-failure fetches.
    ar5iv_yymm_cutoff = end_cursor.strftime("%y%m")

    run_start = time.time()
    attempted = 0
    successes = 0
    skipped_future_yymm = 0
    months_walked = 0

    for _ in range(config.ARXIV_FETCH_MAX_MONTHS_BACK):
        month_start = _month_floor(end_cursor)
        slice_start = month_start
        slice_end = end_cursor
        logger.info(
            "=== Month slice %d/%d: %s to %s ===",
            months_walked + 1,
            config.ARXIV_FETCH_MAX_MONTHS_BACK,
            slice_start.date(),
            slice_end.date(),
        )

        try:
            candidates = source.discover(slice_start, slice_end)
        except Exception as exc:
            logger.warning(
                "Discovery failed for %s to %s — %s",
                slice_start.date(),
                slice_end.date(),
                exc,
            )
            candidates = []

        for paper in candidates:
            on_disk = _count_enriched_on_disk()
            if on_disk >= target:
                break

            save_path = os.path.join(
                config.RAW_DIR, f"{paper['paper_id']}.json"
            )
            if os.path.exists(save_path):
                continue

            # Skip papers whose announcement YYMM is beyond ar5iv's coverage
            if paper["paper_id"][:4] > ar5iv_yymm_cutoff:
                skipped_future_yymm += 1
                continue

            time.sleep(config.FETCH_DELAY_SECONDS)
            attempted += 1
            paper = source.enrich(paper)

            if not paper["ar5iv_success"]:
                if attempted % 50 == 0:
                    _log_progress(
                        run_start, attempted, successes, on_disk, target
                    )
                continue

            with open(save_path, "w") as f:
                json.dump(paper, f, indent=2)
            successes += 1

            if attempted % 50 == 0:
                _log_progress(
                    run_start, attempted, successes, on_disk + 1, target
                )

        months_walked += 1
        if _count_enriched_on_disk() >= target:
            logger.info("Target %d reached; stopping.", target)
            break

        # Step to the last second of the previous month
        end_cursor = month_start - timedelta(seconds=1)
    else:
        logger.info(
            "Max-months-back (%d) reached without hitting target.",
            config.ARXIV_FETCH_MAX_MONTHS_BACK,
        )

    final_count = _count_enriched_on_disk()
    added = final_count - starting_count
    _log_progress(run_start, attempted, successes, final_count, target, final=True)
    logger.info(
        "Done. %d attempted, %d enriched this run, %d total on disk (%+d), "
        "%d skipped (YYMM > %s)",
        attempted,
        successes,
        final_count,
        added,
        skipped_future_yymm,
        ar5iv_yymm_cutoff,
    )

    if added > 0:
        _invalidate_papers_json()


def _log_progress(
    run_start: float,
    attempted: int,
    successes: int,
    on_disk: int,
    target: int,
    final: bool = False,
) -> None:
    elapsed = time.time() - run_start
    rate = (successes / attempted) if attempted else 0.0
    remaining = max(0, target - on_disk)
    # ETA assumes we keep hitting the observed success rate at current delay
    secs_per_try = config.FETCH_DELAY_SECONDS
    eta_secs = (remaining / rate) * secs_per_try if rate > 0 else float("inf")
    tag = "FINAL" if final else "progress"
    logger.info(
        "[%s] attempted=%d enriched_run=%d on_disk=%d/%d "
        "ar5iv_rate=%.1f%% elapsed=%.0fs eta=%s",
        tag,
        attempted,
        successes,
        on_disk,
        target,
        100 * rate,
        elapsed,
        f"{eta_secs/3600:.1f}h" if eta_secs != float("inf") else "n/a",
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        default="ar5iv",
        choices=sorted(SOURCES),
        help="Which Source implementation to use for discover + enrich.",
    )
    args = parser.parse_args()
    fetch_papers(source_name=args.source)
