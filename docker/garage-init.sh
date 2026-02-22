#!/bin/sh
# ============================================================================
# Garage v2 — One-time initialization script
#
# Run via Docker Compose (garage-init service) or manually:
#   docker exec imagiverse-garage sh /garage-init.sh
#
# What this does:
#   1. Waits for Garage admin API to be ready
#   2. Gets the node ID from cluster status
#   3. Assigns the node to a zone and applies the layout (single-node setup)
#   4. Creates the imagiverse-media bucket
#   5. Creates/imports the dev access key
#   6. Grants the key read/write/owner access to the bucket
#
# Adjust GARAGE_ADMIN_URL and GARAGE_ADMIN_TOKEN to match your environment.
# ============================================================================

set -e

GARAGE_ADMIN_URL="${GARAGE_ADMIN_URL:-http://garage:3902}"
GARAGE_ADMIN_TOKEN="${GARAGE_ADMIN_TOKEN:-dev-admin-token-change-in-production}"
BUCKET_NAME="${S3_BUCKET:-imagiverse-media}"
ACCESS_KEY_ID="${S3_ACCESS_KEY:-dev-access-key}"
SECRET_KEY="${S3_SECRET_KEY:-dev-secret-key}"

AUTH_HEADER="Authorization: Bearer ${GARAGE_ADMIN_TOKEN}"

echo "[garage-init] Waiting for Garage admin API at ${GARAGE_ADMIN_URL}..."
MAX_WAIT=60
WAITED=0
until curl -sf "${GARAGE_ADMIN_URL}/health" > /dev/null 2>&1; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "[garage-init] ERROR: Garage did not become ready within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done
echo "[garage-init] Garage is ready."

# ── Step 1: Get cluster status ────────────────────────────────────────────────
echo "[garage-init] Fetching cluster status..."
STATUS=$(curl -sf -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v1/status" 2>/dev/null || echo "")

if [ -z "$STATUS" ]; then
  echo "[garage-init] WARNING: Could not fetch cluster status. The admin API may use a different path."
  echo "[garage-init] Trying /v0/status..."
  STATUS=$(curl -sf -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v0/status" 2>/dev/null || echo "")
fi

# Extract node ID (first 64-char hex string in the response)
NODE_ID=$(echo "$STATUS" | grep -oE '"id":"[0-9a-f]{8,}"' | head -1 | sed 's/"id":"//;s/"//')

if [ -z "$NODE_ID" ]; then
  echo "[garage-init] WARNING: Could not extract node ID from status response."
  echo "[garage-init] Status response was: $STATUS"
  echo "[garage-init] Attempting to use garage CLI to get node ID..."
  NODE_ID=$(garage -c /etc/garage/garage.toml node id 2>/dev/null | grep -oE '[0-9a-f]{8,}' | head -1 || echo "")
fi

if [ -z "$NODE_ID" ]; then
  echo "[garage-init] ERROR: Could not determine node ID. Manual initialization required."
  echo "[garage-init] See: https://garagehq.deuxfleurs.fr/documentation/quick-start/"
  exit 1
fi
echo "[garage-init] Node ID: ${NODE_ID}"

# ── Step 2: Apply layout (single-node) ───────────────────────────────────────
echo "[garage-init] Applying single-node layout..."
LAYOUT_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v1/layout" \
  -d "[{\"id\": \"${NODE_ID}\", \"zone\": \"dc1\", \"capacity\": 10737418240}]" 2>/dev/null || echo "")

if echo "$LAYOUT_RESP" | grep -qi "error"; then
  echo "[garage-init] Layout assign returned: $LAYOUT_RESP (may already be set — continuing)"
fi

APPLY_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v1/layout/apply" \
  -d '{"version": 1}' 2>/dev/null || echo "")

if echo "$APPLY_RESP" | grep -qi "error"; then
  echo "[garage-init] Layout apply returned: $APPLY_RESP (may already be applied — continuing)"
fi
echo "[garage-init] Layout step complete."

# ── Step 3: Create bucket ─────────────────────────────────────────────────────
echo "[garage-init] Creating bucket: ${BUCKET_NAME}..."
BUCKET_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v1/bucket" \
  -d "{\"globalAlias\": \"${BUCKET_NAME}\"}" 2>/dev/null || echo "")

if echo "$BUCKET_RESP" | grep -qi "error\|already"; then
  echo "[garage-init] Bucket response: $BUCKET_RESP (may already exist — continuing)"
fi
echo "[garage-init] Bucket step complete."

# ── Step 4: Create/import access key ─────────────────────────────────────────
echo "[garage-init] Creating access key: ${ACCESS_KEY_ID}..."
# Garage v1 supports key import via POST /v1/key?import
KEY_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v1/key?import" \
  -d "{\"name\": \"dev-key\", \"accessKeyId\": \"${ACCESS_KEY_ID}\", \"secretAccessKey\": \"${SECRET_KEY}\"}" \
  2>/dev/null || echo "")

if echo "$KEY_RESP" | grep -qi "error\|already\|exists"; then
  echo "[garage-init] Key response: $KEY_RESP (key may already exist — continuing)"
fi
echo "[garage-init] Key step complete."

# ── Step 5: Get bucket ID and grant access ────────────────────────────────────
echo "[garage-init] Fetching bucket ID for access grant..."
BUCKET_INFO=$(curl -sf \
  -H "$AUTH_HEADER" \
  "${GARAGE_ADMIN_URL}/v1/bucket?alias=${BUCKET_NAME}" 2>/dev/null || echo "")

BUCKET_ID=$(echo "$BUCKET_INFO" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//;s/"//')

if [ -n "$BUCKET_ID" ]; then
  echo "[garage-init] Granting access: key=${ACCESS_KEY_ID} → bucket=${BUCKET_ID}..."
  ALLOW_RESP=$(curl -sf -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    "${GARAGE_ADMIN_URL}/v1/bucket/allow" \
    -d "{\"bucketId\": \"${BUCKET_ID}\", \"accessKeyId\": \"${ACCESS_KEY_ID}\", \"read\": true, \"write\": true, \"owner\": true}" \
    2>/dev/null || echo "")

  if echo "$ALLOW_RESP" | grep -qi "error"; then
    echo "[garage-init] Allow response: $ALLOW_RESP (may already be allowed — continuing)"
  fi
  echo "[garage-init] Access grant complete."
else
  echo "[garage-init] WARNING: Could not fetch bucket ID. Grant access manually:"
  echo "  garage bucket allow ${BUCKET_NAME} --read --write --owner --key ${ACCESS_KEY_ID}"
fi

echo ""
echo "[garage-init] ✅ Garage initialization complete!"
echo "[garage-init] S3 endpoint:  ${GARAGE_ADMIN_URL%:3902}:3900"
echo "[garage-init] Bucket:       ${BUCKET_NAME}"
echo "[garage-init] Access key:   ${ACCESS_KEY_ID}"
