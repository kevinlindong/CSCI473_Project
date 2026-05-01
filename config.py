"""Central configuration for the ArXiv Research Assistant."""

import os

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
# k=26 chosen via NMI/ARI sweep against arXiv primary_category.
# See scripts/sweep_n_clusters.py and data/processed/sweep_n_clusters.json.
N_CLUSTERS = 26
KMEANS_MAX_ITER = 100
KMEANS_SEED = 42

# --- k-NN graph ---
KNN_NEIGHBORS = 8

# --- LLM ---
LLM_MODEL_NAME = "Qwen/Qwen2.5-1.5B-Instruct"

# "local" loads LLM_MODEL_NAME via transformers; "openrouter" calls the API.
# Cluster labeling always uses local.
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "local")

OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-haiku-4.5")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_TEMPERATURE = 0.0

# --- Arxiv Fetch ---
ARXIV_CATEGORIES = ["cs.LG", "cs.AI", "cs.CV", "cs.CL", "cs.NE", "stat.ML"]
ARXIV_MAX_RESULTS_PER_QUERY = 5000
ARXIV_TARGET_ENRICHED = 10000
ARXIV_FETCH_MAX_MONTHS_BACK = 12

# --- ar5iv Scraping ---
AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html"
FETCH_DELAY_SECONDS = 3.0
AR5IV_END_DATE = "2026-03-31"
