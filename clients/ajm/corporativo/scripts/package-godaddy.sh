#!/usr/bin/env bash
# Build the AJM corporativo site for alfredjan.com/corporativo and pack it as one zip to upload into
# GoDaddy's public_html and extract there (cPanel File Manager → Upload → Extract).
#
#   bash clients/ajm/corporativo/scripts/package-godaddy.sh   → clients/ajm/corporativo/ajm-corporativo.zip
#
# One address, one page (Łukasz, 2026-09-29): Spanish by default, the header switch reloads it with
# ?lang=en. The zip holds a single folder, corporativo/ (index.html, assets/, media/, .htaccess).
set -euo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$APP/dist-godaddy"
rm -rf "$OUT" "$APP/ajm-corporativo.zip" "$APP/ajm-alfredjan.zip"

cd "$APP"
VITE_PATH_ROUTING=off VITE_DEFAULT_LOCALE=es VITE_MEDIA_BASE=/corporativo/media \
  npx vite build --base /corporativo/ --outDir "$OUT/corporativo" --emptyOutDir

# the site's own rules (HTTPS, caching), based at /corporativo/
sed 's|^  RewriteBase /$|  RewriteBase /corporativo/|' public/.htaccess > "$OUT/corporativo/.htaccess"

(cd "$OUT" && zip -qr "$APP/ajm-corporativo.zip" corporativo)
du -sh "$APP/ajm-corporativo.zip"
