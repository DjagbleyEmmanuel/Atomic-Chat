#!/bin/bash
# Download all source files for Atomic-Chat with resume/retry

set -e
REPO="AtomicBot-ai/Atomic-Chat"
BRANCH="main"
BASE="https://raw.githubusercontent.com/$REPO/$BRANCH"
DEST="/home/ghost/Documents/Default Project/Atomic-Chat"
FILE_LIST="/tmp/files_to_download.json"
MAX_RETRIES=5
BATCH_SIZE=20
FAILED_FILE="/tmp/failed_downloads.txt"

rm -f "$FAILED_FILE"

# Load file list from JSON
python3 -c "
import json
with open('$FILE_LIST') as f:
    files = json.load(f)
for f in files:
    print(f)
" > /tmp/all_files.txt

TOTAL=$(wc -l < /tmp/all_files.txt)
echo "Total files to download: $TOTAL"

download_batch() {
    local batch_file="$1"
    local pids=()
    local success=0
    local fail=0
    
    while IFS= read -r filepath; do
        [ -z "$filepath" ] && continue
        localpath="$DEST/$filepath"
        mkdir -p "$(dirname "$localpath")"
        
        (
            curl -sSf --max-time 60 --retry 3 --retry-delay 5 \
                "$BASE/$filepath" -o "$localpath" 2>/dev/null
        ) &
        pids+=($!)
    done < "$batch_file"
    
    for pid in "${pids[@]}"; do
        wait $pid && ((success++)) || {
            echo "Failed PID $pid"
            ((fail++))
        }
    done
    
    echo "Batch: $success success, $fail failed"
    [ $fail -eq 0 ]
}

# Download in batches
FAILED=0
BATCH_NUM=0
while IFS= read -r filepath; do
    [ -z "$filepath" ] && continue
    localpath="$DEST/$filepath"
    
    if [ -f "$localpath" ] && [ -s "$localpath" ]; then
        continue  # already downloaded
    fi
    
    echo "$filepath" >> /tmp/current_batch.txt
    
    if [ "$(wc -l < /tmp/current_batch.txt)" -ge "$BATCH_SIZE" ]; then
        BATCH_NUM=$((BATCH_NUM + 1))
        pct=$((BATCH_NUM * BATCH_SIZE * 100 / TOTAL))
        echo "[${pct}%] Downloading batch $BATCH_NUM..."
        if ! download_batch /tmp/current_batch.txt; then
            cat /tmp/current_batch.txt >> "$FAILED_FILE"
            FAILED=$((FAILED + 1))
        fi
        rm -f /tmp/current_batch.txt
    fi
done < /tmp/all_files.txt

# Last partial batch
if [ -f /tmp/current_batch.txt ] && [ -s /tmp/current_batch.txt ]; then
    BATCH_NUM=$((BATCH_NUM + 1))
    echo "Downloading final batch $BATCH_NUM..."
    if ! download_batch /tmp/current_batch.txt; then
        cat /tmp/current_batch.txt >> "$FAILED_FILE"
        FAILED=$((FAILED + 1))
    fi
    rm -f /tmp/current_batch.txt
fi

# Retry failed files
if [ -f "$FAILED_FILE" ] && [ -s "$FAILED_FILE" ]; then
    echo ""
    echo "=== Retrying $FAILED failed files ==="
    for attempt in $(seq 1 $MAX_RETRIES); do
        echo "Retry attempt $attempt..."
        python3 << 'PYEOF'
import os, subprocess, json
repo = "AtomicBot-ai/Atomic-Chat"
branch = "main"
base = f"https://raw.githubusercontent.com/{repo}/{branch}"
dest = "/home/ghost/Documents/Default Project/Atomic-Chat"
failed_file = "/tmp/failed_downloads.txt"

with open(failed_file) as f:
    files = [line.strip() for line in f if line.strip()]

remaining = []
for filepath in files:
    localpath = os.path.join(dest, filepath)
    os.makedirs(os.path.dirname(localpath), exist_ok=True)
    r = subprocess.run(
        ["curl", "-sSf", "--max-time", "120", f"{base}/{filepath}", "-o", localpath],
        capture_output=True
    )
    if r.returncode != 0:
        remaining.append(filepath)

if remaining:
    with open(failed_file, 'w') as f:
        for fp in remaining:
            f.write(fp + '\n')
    print(f"Still failed: {len(remaining)}")
else:
    open(failed_file, 'w').close()
    print("All files downloaded!")
PYEOF
        if [ ! -s "$FAILED_FILE" ]; then
            break
        fi
        sleep 10
    done
fi

# Summary
DOWNLOADED=$(find "$DEST/web-app/src" "$DEST/src-tauri/src" "$DEST/core/src" -type f 2>/dev/null | wc -l)
echo ""
echo "=========================================="
echo "Download complete!"
echo "Files downloaded: $DOWNLOADED"
echo "Still failed: $(wc -l < "$FAILED_FILE" 2>/dev/null || echo 0)"
echo "=========================================="
