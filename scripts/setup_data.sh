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

ASSET="data-snapshot.tar.zst"
SHA="${ASSET}.sha256"

echo "Downloading data snapshot from $REPO release $TAG ..."

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "  using gh CLI (authenticated)"
  gh release download "$TAG" --repo "$REPO" --pattern "*.tar.zst" --output "$ASSET" --clobber
  gh release download "$TAG" --repo "$REPO" --pattern "*.sha256" --output "$SHA"  --clobber
else
  echo "  using curl (gh not authenticated; works for public repos only)"
  if [[ "$TAG" == "latest" ]]; then
    BASE="https://github.com/$REPO/releases/latest/download"
  else
    BASE="https://github.com/$REPO/releases/download/$TAG"
  fi
  # The asset filename inside the release is date-stamped; resolve via the API
  # and fall back to a glob fetch if jq isn't available.
  if command -v jq >/dev/null 2>&1; then
    API="https://api.github.com/repos/$REPO/releases/${TAG#v}"
    [[ "$TAG" == "latest" ]] && API="https://api.github.com/repos/$REPO/releases/latest"
    URL=$(curl -sL "$API" | jq -r '.assets[] | select(.name | endswith(".tar.zst")) | .browser_download_url')
    URL_SHA=$(curl -sL "$API" | jq -r '.assets[] | select(.name | endswith(".sha256")) | .browser_download_url')
    curl -L -o "$ASSET" "$URL"
    curl -L -o "$SHA"   "$URL_SHA"
  else
    echo "  jq not available — install jq, or use 'gh auth login' for the gh path" >&2
    exit 1
  fi
fi

echo "Verifying sha256 ..."
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
