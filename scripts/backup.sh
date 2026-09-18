#!/usr/bin/env bash
# Dump Postgres and upload it to object storage.
#
#   ./scripts/backup.sh                     # uses .env
#   PG_CONTAINER=… S3_BUCKET=… ./scripts/backup.sh
#
# Runs anywhere Docker and the AWS CLI are available — on the host by cron, or
# from a workstation over SSH. Deliberately independent of the control panel:
# a backup you cannot take by hand is a backup you cannot trust.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$ROOT/.env" ] && set -a && . "$ROOT/.env" && set +a

PG_CONTAINER="${PG_CONTAINER:-$(docker ps --format '{{.Names}}' | grep -E 'postgres|pluck-postgres' | head -1)}"
PG_USER="${POSTGRES_USER:-pluck}"
PG_DB="${POSTGRES_DB:-pluck}"
BUCKET="${S3_BUCKET:?set S3_BUCKET}"
PREFIX="${BACKUP_PREFIX:-backups/postgres}"
PROFILE="${AWS_PROFILE:-ayush}"

if [ -z "$PG_CONTAINER" ]; then
  echo "No Postgres container found. Set PG_CONTAINER." >&2
  exit 1
fi

STAMP="$(date -u +%Y-%m-%d)/pluck-$(date -u +%H%M%S).sql.gz"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" --no-owner --clean --if-exists | gzip -9 > "$TMP"

# A dump without tables means the connection succeeded and nothing came back.
if ! gzip -dc "$TMP" | grep -q "CREATE TABLE"; then
  echo "Dump contains no tables; refusing to upload." >&2
  exit 1
fi

aws s3 cp "$TMP" "s3://${BUCKET}/${PREFIX}/${STAMP}" --profile "$PROFILE" --only-show-errors
echo "backed up $(du -h "$TMP" | cut -f1) to s3://${BUCKET}/${PREFIX}/${STAMP}"
