#!/bin/bash
URL="${SUPABASE_URL:-https://oxzzdkwvjdxpgdnrbflq.supabase.co}/functions/v1/backfill_embeddings"
UID_VAL="${HUB_USER_ID}"
BATCH=200

if [ -z "$UID_VAL" ]; then
  echo "Error: HUB_USER_ID environment variable is required"
  exit 1
fi

for ST in gmail task media_feed project client invoice expense money_document; do
  echo "--- $ST ---"
  ROUND=0
  while true; do
    ROUND=$((ROUND+1))
    echo "  Round $ROUND..."
    RES=$(curl -s --max-time 120 -X POST "$URL" \
      -H "Content-Type: application/json" \
      -d "{\"user_id\":\"$UID_VAL\",\"source_type\":\"$ST\",\"batch_size\":$BATCH}")
    RC=$?
    if [ $RC -ne 0 ]; then
      echo "  curl failed, retry in 10s..."
      sleep 10
      continue
    fi
    PROC=$(echo "$RES" | grep -o '"processed":[0-9]*' | grep -o '[0-9]*')
    if [ -z "$PROC" ]; then
      echo "  parse error, retry in 10s..."
      sleep 10
      continue
    fi
    echo "  processed=$PROC"
    if [ "$PROC" -eq 0 ]; then
      echo "  $ST complete."
      break
    fi
    sleep 3
  done
done
echo "=== Backfill Complete ==="
