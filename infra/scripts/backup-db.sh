#!/usr/bin/env bash
# Weekly PostgreSQL backup → Backblaze B2
#
# Prerequisites on VPS:
#   - rclone configured with a B2 remote named "b2" (run: rclone config)
#   - B2 bucket "neosleep-backups" created
#   - pg_dump available (postgresql-client)
#
# Install via cron (as user deploy):
#   0 2 * * 0  /home/deploy/scripts/backup-db.sh >> /home/deploy/logs/backup.log 2>&1
#
# Manual test run:
#   bash /home/deploy/scripts/backup-db.sh

set -euo pipefail

DATE=$(date +%Y-%m-%d)
TMPDIR=$(mktemp -d)
LOGPREFIX="[backup-db] $(date '+%Y-%m-%d %H:%M:%S')"

echo "$LOGPREFIX Starting backup..."

# Dump PROD database
PROD_FILE="$TMPDIR/prod-$DATE.sql.gz"
pg_dump -U neosleep neosleep_prod | gzip > "$PROD_FILE"
echo "$LOGPREFIX PROD dump complete: $(du -sh "$PROD_FILE" | cut -f1)"

# Dump UAT database
UAT_FILE="$TMPDIR/uat-$DATE.sql.gz"
pg_dump -U neosleep neosleep_uat | gzip > "$UAT_FILE"
echo "$LOGPREFIX UAT dump complete: $(du -sh "$UAT_FILE" | cut -f1)"

# Upload to Backblaze B2
rclone copy "$PROD_FILE" b2:neosleep-backups/prod/
echo "$LOGPREFIX PROD uploaded to B2."

rclone copy "$UAT_FILE" b2:neosleep-backups/uat/
echo "$LOGPREFIX UAT uploaded to B2."

# Clean up temp files
rm -rf "$TMPDIR"
echo "$LOGPREFIX Done."

# Prune B2 backups older than 90 days
rclone delete b2:neosleep-backups/prod/ --min-age 90d
rclone delete b2:neosleep-backups/uat/  --min-age 90d
echo "$LOGPREFIX Old backups pruned (>90 days)."
