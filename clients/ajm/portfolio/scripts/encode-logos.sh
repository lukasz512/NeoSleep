#!/usr/bin/env bash
# Client logos → one-colour masks. The page paints each logo with `currentColor` through a CSS
# mask, so the same file works on paper and on charcoal and every logo is monochrome (proposal:
# "solo cuatro logos, monocromáticos"). Only the shape (alpha) of each file is used.
#
#   AJM_MATERIALS=~/Documents/Private/AJM-materials bash scripts/encode-logos.sh
set -euo pipefail

SRC="${AJM_MATERIALS:-$HOME/Documents/Private/AJM-materials}/logos"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/media/logos"
mkdir -p "$OUT"

# mask_from_light_bg <input> <output.png> [crop]: dark/colour logo on a white background →
# black + alpha. The white margin is trimmed (auto, or the given crop when auto-detection trips
# on the file), and colour becomes opacity (darker = more solid).
mask_from_light_bg() {
  local crop="${3:-}"
  if [ -z "$crop" ]; then
    # skip=0: a still image has a single frame, and cropdetect skips the first two by default
    crop="$(ffmpeg -v info -i "$1" -vf "format=gray,negate,cropdetect=limit=24:round=2:skip=0" -f null - 2>&1 \
      | grep -o 'crop=[0-9:]*' | tail -1 || true)"
  fi
  crop="${crop:-null}"
  ffmpeg -v error -y -i "$1" -filter_complex \
    "[0]${crop},split[x][y];[x]format=gray,negate,lut=y='clip((val-20)*3,0,255)'[a];[y]format=rgb24,lutrgb=r=0:g=0:b=0[c];[c][a]alphamerge,format=rgba" \
    -frames:v 1 "$2" < /dev/null
}

cp "$SRC/universal.svg" "$OUT/universal.svg"   # vector, dark shapes only, no background
cp "$SRC/privalia.png" "$OUT/privalia.png"     # already transparent
mask_from_light_bg "$SRC/mendel.jpg" "$OUT/mendel.png"
# the Planeta webp carries broken EXIF and cropdetect cuts into the wordmark: crop by hand
mask_from_light_bg "$SRC/planeta.webp" "$OUT/planeta.png" "crop=500:100:62:110"
ls -la "$OUT"
