#!/bin/sh
# ============================================================================
# Garage v2 — One-time initialization script
#
# Run via Docker Compose (garage-init service) or manually:
#   docker compose -f docker/docker-compose.yml run --rm garage-init
#
# What this does:
#   1. Waits for Garage admin API to be ready
#   2. Gets the node ID from cluster status
#   3. Assigns the node to a zone and applies the layout (single-node setup)
#   4. Creates the imagiverse-media bucket
#   5. Creates a new API access key (Garage v2 generates the key ID/secret)
#   6. Grants the key read/write/owner access to the bucket
#   7. Prints the credentials — update your .env file with them
#
# Adjust GARAGE_ADMIN_URL and GARAGE_ADMIN_TOKEN to match your environment.
# ============================================================================

set -e

GARAGE_ADMIN_URL="${GARAGE_ADMIN_URL:-http://garage:3902}"
GARAGE_ADMIN_TOKEN="${GARAGE_ADMIN_TOKEN:-dev-admin-token-change-in-production}"
BUCKET_NAME="${S3_BUCKET:-imagiverse-media}"
KEY_NAME="${S3_KEY_NAME:-dev-key}"

AUTH_HEADER="Authorization: Bearer ${GARAGE_ADMIN_TOKEN}"

echo "[garage-init] Waiting for Garage admin API at ${GARAGE_ADMIN_URL}..."
MAX_WAIT=60
WAITED=0
until curl -s -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v2/GetClusterStatus" 2>/dev/null | grep -q '"nodes"'; do
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
STATUS=$(curl -sf -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v2/GetClusterStatus" 2>/dev/null || echo "")

NODE_ID=$(echo "$STATUS" | grep -oE '"id":\s*"[0-9a-f]{8,}"' | head -1 | sed 's/"id":[[:space:]]*"//;s/"//')

if [ -z "$NODE_ID" ]; then
  echo "[garage-init] ERROR: Could not determine node ID."
  echo "[garage-init] Status response was: $STATUS"
  exit 1
fi
echo "[garage-init] Node ID: ${NODE_ID}"

# ── Step 2: Check if layout already applied ───────────────────────────────────
LAYOUT=$(curl -sf -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v2/GetClusterLayout" 2>/dev/null || echo "")
LAYOUT_VERSION=$(echo "$LAYOUT" | grep -oE '"version":\s*[0-9]+' | head -1 | sed 's/"version":[[:space:]]*//')

if [ "${LAYOUT_VERSION:-0}" -gt 0 ]; then
  echo "[garage-init] Layout already applied (version ${LAYOUT_VERSION}), skipping layout setup."
else
  echo "[garage-init] Applying single-node layout..."
  curl -sf -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    "${GARAGE_ADMIN_URL}/v2/UpdateClusterLayout" \
    -d "{\"roles\": [{\"id\": \"${NODE_ID}\", \"zone\": \"dc1\", \"capacity\": 10737418240, \"tags\": []}]}" \
    > /dev/null

  APPLY_RESP=$(curl -sf -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    "${GARAGE_ADMIN_URL}/v2/ApplyClusterLayout" \
    -d '{"version": 1}' 2>/dev/null || echo "")

  if echo "$APPLY_RESP" | grep -qi '"code"'; then
    echo "[garage-init] WARNING: Layout apply returned: $APPLY_RESP"
  fi
  echo "[garage-init] Layout step complete."
fi

# ── Step 3: Create bucket ─────────────────────────────────────────────────────
echo "[garage-init] Creating bucket: ${BUCKET_NAME}..."
BUCKET_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v2/CreateBucket" \
  -d "{\"globalAlias\": \"${BUCKET_NAME}\"}" 2>/dev/null || echo "")

if echo "$BUCKET_RESP" | grep -qi '"code"'; then
  echo "[garage-init] Bucket may already exist: $BUCKET_RESP"
fi
echo "[garage-init] Bucket step complete."

# ── Step 4: Get bucket ID ─────────────────────────────────────────────────────
BUCKET_INFO=$(curl -sf \
  -H "$AUTH_HEADER" \
  "${GARAGE_ADMIN_URL}/v2/GetBucketInfo?globalAlias=${BUCKET_NAME}" 2>/dev/null || echo "")

BUCKET_ID=$(echo "$BUCKET_INFO" | grep -oE '"id":\s*"[^"]+"' | head -1 | sed 's/"id":[[:space:]]*"//;s/"//')

if [ -z "$BUCKET_ID" ]; then
  echo "[garage-init] ERROR: Could not fetch bucket ID for '${BUCKET_NAME}'."
  exit 1
fi

# ── Step 5: Check if key already exists ───────────────────────────────────────
EXISTING_KEYS=$(curl -sf -H "$AUTH_HEADER" "${GARAGE_ADMIN_URL}/v2/ListKeys" 2>/dev/null || echo "[]")

if echo "$EXISTING_KEYS" | grep -q "\"name\".*\"${KEY_NAME}\""; then
  echo "[garage-init] Key '${KEY_NAME}' already exists. Skipping key creation."
  ACCESS_KEY_ID=$(echo "$EXISTING_KEYS" | tr -d ' \n' | grep -oE '"id":"GK[^"]+"' | head -1 | sed 's/"id":"//;s/"//')
  echo "[garage-init] Existing key: ${ACCESS_KEY_ID}"
else
  echo "[garage-init] Creating access key: ${KEY_NAME}..."
  KEY_RESP=$(curl -sf -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    "${GARAGE_ADMIN_URL}/v2/CreateKey" \
    -d "{\"name\": \"${KEY_NAME}\"}" 2>/dev/null || echo "")

  ACCESS_KEY_ID=$(echo "$KEY_RESP" | grep -oE '"accessKeyId":\s*"[^"]+"' | sed 's/"accessKeyId":[[:space:]]*"//;s/"//')
  SECRET_KEY=$(echo "$KEY_RESP" | grep -oE '"secretAccessKey":\s*"[^"]+"' | sed 's/"secretAccessKey":[[:space:]]*"//;s/"//')

  if [ -z "$ACCESS_KEY_ID" ]; then
    echo "[garage-init] ERROR: Could not create access key."
    echo "[garage-init] Response: $KEY_RESP"
    exit 1
  fi

  echo "[garage-init] Key created successfully."
fi

# ── Step 6: Grant access ──────────────────────────────────────────────────────
echo "[garage-init] Granting access: key=${ACCESS_KEY_ID} → bucket=${BUCKET_ID}..."
ALLOW_RESP=$(curl -sf -X POST \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  "${GARAGE_ADMIN_URL}/v2/AllowBucketKey" \
  -d "{\"bucketId\": \"${BUCKET_ID}\", \"accessKeyId\": \"${ACCESS_KEY_ID}\", \"permissions\": {\"read\": true, \"write\": true, \"owner\": true}}" \
  2>/dev/null || echo "")

if echo "$ALLOW_RESP" | grep -qi '"code"'; then
  echo "[garage-init] WARNING: Allow response: $ALLOW_RESP"
fi
echo "[garage-init] Access grant complete."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "[garage-init] ============================================="
echo "[garage-init] Garage initialization complete!"
echo "[garage-init] S3 endpoint:    http://localhost:3900"
echo "[garage-init] Bucket:         ${BUCKET_NAME}"
echo "[garage-init] Access key ID:  ${ACCESS_KEY_ID}"
if [ -n "$SECRET_KEY" ]; then
  echo "[garage-init] Secret key:     ${SECRET_KEY}"
  echo "[garage-init]"
  echo "[garage-init] UPDATE your .env file:"
  echo "[garage-init]   S3_ACCESS_KEY=${ACCESS_KEY_ID}"
  echo "[garage-init]   S3_SECRET_KEY=${SECRET_KEY}"
fi
echo "[garage-init] ============================================="
