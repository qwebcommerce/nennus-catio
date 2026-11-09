#!/usr/bin/env bash
# Backup PostgreSQL used by Icodo POS (Prisma DIRECT_URL preferred).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/system/server/.env"
OUT_DIR="${ROOT}/backups"
STAMP="$(date +%Y%m%d-%H%M)"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# Load KEY=VALUE lines (ignore comments / blanks)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" =~ ^(DATABASE_URL|DIRECT_URL)= ]]; then
    export "$line"
  fi
done < "$ENV_FILE"
set +a

URL="${DIRECT_URL:-${DATABASE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Set DIRECT_URL or DATABASE_URL in system/server/.env" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
OUT="${OUT_DIR}/pos-${STAMP}.dump"

echo "Writing $OUT …"
pg_dump "$URL" -Fc -f "$OUT"
echo "Done ($(du -h "$OUT" | awk '{print $1}'))."
echo "Restore example:"
echo "  pg_restore --clean --if-exists --no-owner --dbname=\"\$DIRECT_URL\" $OUT"
