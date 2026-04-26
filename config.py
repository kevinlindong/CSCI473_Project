"""
config.py — Central configuration for the ArXiv Research Assistant.

All configurable values (paths, model names, hyperparameters) live here.
Other modules import from this file rather than hardcoding values.
"""

import os

# --- Scale assumptions ---
# Current architecture is sized for:
#   N (papers)  <=  ~30,000     (brute-force cosine in src/retrieval.py)
#   N_CLUSTERS  <=  ~100        (full Lloyd's k-means in src/clustering.py)
#   k-NN graph  <=  ~30,000²    (full N×N similarity matrix in src/graph.py)
#
# Past those thresholds, expect to:
#   - replace BruteForceRetriever with a FAISS / hnswlib ANN-backed Retriever
#   - swap k-means for MiniBatchKMeans (sklearn) warm-started across runs
#   - build the kNN graph via FAISS query, never materialize the N×N matrix
#   - move sentence-transformer encoding to GPU
# See README's "Scaling beyond 10k" section for the full upgrade map.

# --- Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_DIR = os.path.join(DATA_DIR, "raw", "enriched")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
EMBEDDINGS_DIR = os.path.join(DATA_DIR, "embeddings")

# --- Encoder ---
ENCODER_MODEL_NAME = "all-mpnet-base-v2"
EMBEDDING_DIM = 768

# --- Retrieval ---
N_RETRIEVAL_RESULTS = 20
N_RERANK_RESULTS = 5

# --- Clustering ---
# N_CLUSTERS=26 chosen via external-validation sweep over k ∈ [10, 50] step 2
# against the 10k broad-ML corpus (cs.LG, cs.AI, cs.CV, cs.CL, cs.NE, stat.ML
# query, but cross-listing means 105 distinct primary_category labels show up):
#   - silhouette skipped (uninformative on 768-d embeddings, slow at N=10k)
#   - NMI vs primary_category peaks at k=26 (0.3553) then plateaus 0.34–0.35
#     through k=50; ARI drops monotonically past k=26
#   - min_cluster_size stays healthy: 114 at k=26, 64 at k=50, no singletons
#     through the swept range
#   - re-run scripts/sweep_n_clusters.py after any significant corpus change
N_CLUSTERS = 26
KMEANS_MAX_ITER = 100
KMEANS_SEED = 42

# --- k-NN graph ---
KNN_NEIGHBORS = 8

# --- LLM ---
# Instruction-tuned causal LM used for (a) cluster topic labeling at pipeline
# time and (b) RAG answer generation. Qwen2.5-1.5B-Instruct was chosen after
# flan-T5-base (250M) produced extractive / single-word labels even with
# few-shot prompting; the 6× param bump plus a modern chat template gives
# coherent 2-5 word topic phrases.
LLM_MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"

# Provider routing for per-request generation. "local" uses LLM_MODEL_NAME via
# transformers; "openrouter" calls OpenRouter's OpenAI-compatible API.
# Cluster labeling (generate_cluster_label) always uses the local path.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "local")

# Default OpenRouter model. Per-call override via the model_name kwarg on
# generate_answer / generate_scoot_reply.
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-haiku-4.5")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_TEMPERATURE = 0.0

# --- Arxiv Fetch ---
ARXIV_CATEGORIES = ["cs.LG", "cs.AI", "cs.CV", "cs.CL", "cs.NE", "stat.ML"]
# Cap per (category, month) arxiv.Search; well below arXiv's ~30k hard window
ARXIV_MAX_RESULTS_PER_QUERY = 5000
# Target-seeking: fetcher stops once this many enriched JSONs exist on disk
ARXIV_TARGET_ENRICHED = 10000
# Safety ceiling so a runaway backward-walk cannot burn indefinitely
ARXIV_FETCH_MAX_MONTHS_BACK = 12

# --- ar5iv Scraping ---
AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html"
FETCH_DELAY_SECONDS = 3.0
# ar5iv coverage ends 2026-03-31; fetcher walks backward from here one month
# at a time until ARXIV_TARGET_ENRICHED is reached or the max-months ceiling hits
AR5IV_END_DATE = "2026-03-31"
