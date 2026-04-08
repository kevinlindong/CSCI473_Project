"""
config.py — Central configuration for the ArXiv Research Assistant.

All configurable values (paths, model names, hyperparameters) live here.
Other modules import from this file rather than hardcoding values.
"""

import os

# --- Paths ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
RAW_DIR = os.path.join(DATA_DIR, "raw", "enriched")
PROCESSED_DIR = os.path.join(DATA_DIR, "processed")
EMBEDDINGS_DIR = os.path.join(DATA_DIR, "embeddings")

# --- Encoder ---
ENCODER_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384

# --- Retrieval ---
N_RETRIEVAL_RESULTS = 20
N_RERANK_RESULTS = 5

# --- Clustering ---
N_CLUSTERS = 10
KMEANS_MAX_ITER = 100
KMEANS_SEED = 42

# --- PCA ---
N_PCA_COMPONENTS = 2

# --- LLM ---
LLM_MODEL_NAME = "google/flan-t5-base"  # Small model for dev; swap for demo
MAX_CONTEXT_LENGTH = 2048

# --- Arxiv Fetch ---
ARXIV_CATEGORIES = ["cs.CL", "cs.LG"]
MAX_PAPERS = 500

# --- ar5iv Scraping ---
AR5IV_BASE_URL = "https://ar5iv.labs.arxiv.org/html"
FETCH_DELAY_SECONDS = 3.0
# ar5iv coverage ends 2026-03-31; fetch the last 7 days of that window
AR5IV_END_DATE = "2026-03-31"
ARXIV_FETCH_DAYS = 7
FIGURE_DIR = os.path.join(RAW_DIR, "figures")
