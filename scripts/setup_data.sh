#!/usr/bin/env bash
# setup_data.sh — Download + extract the data snapshot from GitHub Releases.
#
# Saves teammates ~7 hours of regeneration (fetch_papers + build_embeddings +
# build_papers_db + compute_topic_graph). Idempotent: re-running overwrites
# any existing files in data/.
#
# Usage:
#   ./scripts/setup_data.sh           # latest release
#   ./scripts/setup_data.sh v1.0-data-20260425
#
# Requires: curl, tar, zstd. Optional: gh (used preferentially when authenticated).

set -e

TAG="${1:-latest}"
REPO="kevinlindong/CSCI473_Project"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Sanity: required tools
for cmd in curl tar zstd; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "error: $cmd not on PATH (install with apt/brew)" >&2
    exit 1
  }
done

echo "Downloading data snapshot from $REPO release $TAG ..."

# Clear any prior partials so the discovery glob below is unambiguous
rm -f data-snapshot-*.tar.zst data-snapshot-*.tar.zst.sha256

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "  using gh CLI (authenticated)"
  gh release download "$TAG" --repo "$REPO" --pattern "*.tar.zst" --clobber
  gh release download "$TAG" --repo "$REPO" --pattern "*.sha256"  --clobber
else
  echo "  using curl (gh not authenticated; works for public repos only)"
  # Resolve the date-stamped asset URLs via the GitHub API
  if ! command -v jq >/dev/null 2>&1; then
    echo "  jq not available — install jq, or use 'gh auth login' for the gh path" >&2
    exit 1
  fi
  if [[ "$TAG" == "latest" ]]; then
    API="https://api.github.com/repos/$REPO/releases/latest"
  else
    API="https://api.github.com/repos/$REPO/releases/tags/$TAG"
  fi
  URL=$(curl -sL "$API"     | jq -r '.assets[] | select(.name | endswith(".tar.zst")) | .browser_download_url')
  URL_SHA=$(curl -sL "$API" | jq -r '.assets[] | select(.name | endswith(".sha256"))  | .browser_download_url')
  # -O (capital) saves with the URL's filename, preserving the date-stamped name
  curl -L -O "$URL"
  curl -L -O "$URL_SHA"
fi

# Discover what got downloaded — the SHA file's content references this name
ASSET=$(ls data-snapshot-*.tar.zst 2>/dev/null | head -1)
SHA="${ASSET}.sha256"
if [[ -z "$ASSET" ]] || [[ ! -f "$ASSET" ]] || [[ ! -f "$SHA" ]]; then
  echo "error: download failed — expected data-snapshot-*.tar.zst + .sha256" >&2
  exit 1
fi

echo "Verifying sha256 (against $ASSET) ..."
sha256sum -c "$SHA"

echo "Extracting ..."
tar --use-compress-program="zstd -d" -xf "$ASSET"

echo "Cleaning up ..."
rm -f "$ASSET" "$SHA"

echo
echo "Done. Sanity check:"
echo "  papers.db:        $(test -f data/papers.db && du -h data/papers.db | cut -f1 || echo MISSING)"
echo "  abstracts.npy:    $(test -f data/embeddings/abstracts.npy && du -h data/embeddings/abstracts.npy | cut -f1 || echo MISSING)"
echo "  topic_graph.json: $(test -f data/processed/topic_graph.json && du -h data/processed/topic_graph.json | cut -f1 || echo MISSING)"
echo
echo "Run ./start.sh to launch the app."
