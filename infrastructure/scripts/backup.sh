#!/usr/bin/env bash
# =============================================================================
# Neo CRM — Database backup script
#
# Usage:
#   ./infrastructure/scripts/backup.sh                  # local Docker DB (default)
#   DATABASE_URL=<url> ./infrastructure/scripts/backup.sh   # explicit connection string
#
# Output: backups/neosleep_YYYY-MM-DD_HH-MM-SS.dump  (pg_dump custom format, repo root)
#
# Restore:
#   pg_restore --clean --if-exists -d "$DATABASE_URL" backups/<filename>.dump
#
# Schedule (cron example — runs daily at 02:00):
#   0 2 * * * /path/to/neo-crm/infrastructure/scripts/backup.sh >> /var/log/neo-backup.log 2>&1
#
# Notes:
#   - Supabase Pro plan: automatic daily backups, 7-day retention, point-in-time
#     recovery. Download from: Supabase Dashboard → Project → Database → Backups.
#   - This script is for LOCAL Docker dev and self-hosted (Hetzner) environments.
#   - pg_dump uses "custom" format (-Fc) — smaller, parallelisable on restore.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DATABASE_URL="${DATABASE_URL:-postgresql://neosleep:neosleep_local@localhost:5432/neosleep}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/backups}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="neosleep_${TIMESTAMP}.dump"
RETENTION_DAYS="${RETENTION_DAYS:-7}"   # delete backups older than N days

# ---------------------------------------------------------------------------
# Ensure backup directory exists
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

# ---------------------------------------------------------------------------
# Run pg_dump
# ---------------------------------------------------------------------------
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup → ${BACKUP_DIR}/${FILENAME}"

pg_dump \
  --format=custom \
  --compress=6 \
  --verbose \
  --no-password \
  "$DATABASE_URL" \
  --file="${BACKUP_DIR}/${FILENAME}"

FILESIZE=$(du -sh "${BACKUP_DIR}/${FILENAME}" | cut -f1)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete: ${FILENAME} (${FILESIZE})"

# ---------------------------------------------------------------------------
# Prune old backups (keep last N days)
# ---------------------------------------------------------------------------
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruning backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_DIR" -name "neosleep_*.dump" -mtime +"${RETENTION_DAYS}" -delete
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Done. Current backups:"
ls -lh "$BACKUP_DIR"/neosleep_*.dump 2>/dev/null || echo "  (none)"
