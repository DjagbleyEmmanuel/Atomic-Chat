#!/bin/bash
set -e

WORKDIR="/home/ghost/Documents/Default Project"
REPO_URL="https://github.com/AtomicBot-ai/Atomic-Chat.git"
RELEASE_URL="https://github.com/AtomicBot-ai/Atomic-Chat/archive/refs/tags/v1.1.154.tar.gz"
SRC_DIR="$WORKDIR/Atomic-Chat"
TARBALL="/tmp/atomicsource/Atomic-Chat-1.1.154.tar.gz"
PATCH_DIR="$WORKDIR/patches"
MAX_RETRIES=999
RETRY_DELAY=30

mkdir -p /tmp/atomicsource "$PATCH_DIR"

# Save our modified files as patches
echo "Saving our changes as patches..."
cp "$SRC_DIR/web-app/src/components/ai-elements/conversation.tsx" "$PATCH_DIR/conversation.tsx.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/containers/ThemeSwitcher.tsx" "$PATCH_DIR/ThemeSwitcher.tsx.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/hooks/useTheme.ts" "$PATCH_DIR/useTheme.ts.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/providers/ThemeProvider.tsx" "$PATCH_DIR/ThemeProvider.tsx.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/index.css" "$PATCH_DIR/index.css.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/components/ai-elements/code-block.tsx" "$PATCH_DIR/code-block.tsx.patched" 2>/dev/null || true
cp "$SRC_DIR/web-app/src/types/appearance.d.ts" "$PATCH_DIR/appearance.d.ts.patched" 2>/dev/null || true

# Strategy 1: Download release tarball with aria2c (resume-capable)
download_tarball() {
    echo "[$(date)] Starting tarball download..."
    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "[$(date)] Attempt $attempt: aria2c download"
        if aria2c -x 4 -s 4 --max-tries=0 --retry-wait=10 --connect-timeout=60 --timeout=300 \
            --continue=true --max-connection-per-server=4 --split=4 \
            -o "$(basename "$TARBALL")" "$RELEASE_URL" -d "$(dirname "$TARBALL")" 2>&1; then
            echo "[$(date)] Download completed!"
            
            # Verify it's a valid gzip
            if gzip -t "$TARBALL" 2>/dev/null; then
                echo "[$(date)] Archive verified OK"
                return 0
            else
                echo "[$(date)] Archive corrupted, retrying..."
                rm -f "$TARBALL"
            fi
        else
            echo "[$(date)] Download interrupted (attempt $attempt)"
        fi
        attempt=$((attempt + 1))
        echo "[$(date)] Waiting ${RETRY_DELAY}s before retry..."
        sleep $RETRY_DELAY
    done
    return 1
}

# Strategy 2: Git clone as fallback
git_clone_fallback() {
    echo "[$(date)] Trying git clone fallback..."
    rm -rf "$SRC_DIR"
    local attempt=1
    while [ $attempt -le $MAX_RETRIES ]; do
        echo "[$(date)] Git clone attempt $attempt..."
        if git clone --depth 1 --single-branch "$REPO_URL" "$SRC_DIR" 2>&1; then
            echo "[$(date)] Git clone succeeded!"
            return 0
        fi
        echo "[$(date)] Git clone failed (attempt $attempt)"
        attempt=$((attempt + 1))
        sleep $RETRY_DELAY
    done
    return 1
}

# Main download loop
echo "=========================================="
echo "Atomic Chat - Source Download & Build"
echo "=========================================="
echo "Strategy 1: aria2c tarball (with resume)"
echo "Strategy 2: git clone (fallback)"
echo ""

# Try tarball first
if download_tarball; then
    echo "Extracting tarball..."
    rm -rf "$SRC_DIR"
    mkdir -p "$SRC_DIR"
    tar xzf "$TARBALL" -C "$SRC_DIR" --strip-components=1
    echo "Extraction complete!"
else
    echo "Tarball failed, trying git clone..."
    if ! git_clone_fallback; then
        echo "ERROR: All download methods failed."
        exit 1
    fi
fi

# Apply our patches
echo ""
echo "Applying our fixes..."
if [ -f "$PATCH_DIR/conversation.tsx.patched" ]; then
    cp "$PATCH_DIR/conversation.tsx.patched" "$SRC_DIR/web-app/src/components/ai-elements/conversation.tsx"
    cp "$PATCH_DIR/ThemeSwitcher.tsx.patched" "$SRC_DIR/web-app/src/containers/ThemeSwitcher.tsx"
    cp "$PATCH_DIR/useTheme.ts.patched" "$SRC_DIR/web-app/src/hooks/useTheme.ts"
    cp "$PATCH_DIR/ThemeProvider.tsx.patched" "$SRC_DIR/web-app/src/providers/ThemeProvider.tsx"
    cp "$PATCH_DIR/index.css.patched" "$SRC_DIR/web-app/src/index.css"
    cp "$PATCH_DIR/code-block.tsx.patched" "$SRC_DIR/web-app/src/components/ai-elements/code-block.tsx"
    cp "$PATCH_DIR/appearance.d.ts.patched" "$SRC_DIR/web-app/src/types/appearance.d.ts"
    echo "Patches applied!"
fi

# Build
echo ""
echo "Building..."
cd "$SRC_DIR"
echo "Installing frontend dependencies..."
yarn install --network-timeout 300000 2>&1 || npm install --timeout=300000 2>&1

echo ""
echo "Building .deb package..."
cargo tauri build --bundles deb 2>&1

echo ""
echo "Build complete! Check target/release/bundle/deb/ for .deb file."
