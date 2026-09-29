#!/usr/bin/env bash
# Stills for the three extra projects (Łukasz, V1 = all three, 2026-09-28), cut from AJM's videos:
#   Privalia Beauty Week × Glamour (three vertical reels) · Minions × Vogue Brasil BTS · Indian Wedding CDMX
#
#   AJM_EXTRA="~/Documents/Dokumenty/AJ Management/aj rozne/alfredjan_site 5/alfred5" \
#     bash clients/ajm/portfolio/scripts/encode-extra.sh
#
# Frames were picked from contact sheets: no titles, no logos, no credits. The Glamour reels carry a
# GLAMOUR wordmark in the top corner on every frame, so they are cropped to 4:5 below it.
set -euo pipefail

SRC="${AJM_EXTRA:-$HOME/Documents/Dokumenty/AJ Management/aj rozne/alfredjan_site 5/alfred5}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/media"
FF=(ffmpeg -v error -y)
mkdir -p "$OUT/privalia" "$OUT/more"

# still <input> <seconds> <width> <output-base> [crop-filter]  → .avif + .jpg (same as encode-media.sh)
still() {
  "${FF[@]}" -ss "$2" -i "$1" -frames:v 1 -vf "${5:-null},scale=$3:-2" -q:v 5 "$4.jpg" < /dev/null
  "${FF[@]}" -i "$4.jpg" -frames:v 1 -c:v libsvtav1 -crf 36 -pix_fmt yuv420p "$4.avif" < /dev/null 2>/dev/null
}
# both sizes for landscape footage
wide() {
  still "$1" "$2" 1280 "$3-1280"
  still "$1" "$2" 640 "$3-640"
}

GLAM_CROP="crop=1080:1350:0:300"
GEN="$SRC/Glamour_general.mov"
INV="$SRC/Glamour_invitadas.mov"
MAS="$SRC/Glamour_masterclass.mov"
still "$GEN" 3.4 640 "$OUT/privalia/beauty1-640" "$GLAM_CROP"
still "$MAS" 3.3 640 "$OUT/privalia/beauty2-640" "$GLAM_CROP"
still "$MAS" 7.2 640 "$OUT/privalia/beauty3-640" "$GLAM_CROP"
still "$INV" 8.6 640 "$OUT/privalia/beauty4-640" "$GLAM_CROP"
still "$GEN" 7 640 "$OUT/privalia/beauty5-640" "$GLAM_CROP"
still "$GEN" 9.9 640 "$OUT/privalia/beauty6-640" "$GLAM_CROP"

MIN="$SRC/MinionsVogueBrazil_BTS_AJManagement.mp4"
wide "$MIN" 6.5  "$OUT/more/minions1"
wide "$MIN" 28   "$OUT/more/minions2"
wide "$MIN" 43.5 "$OUT/more/minions3"
wide "$MIN" 15.5 "$OUT/more/minions4"

WED="$SRC/IndianWedding_CDMX_AJManagement.mp4"
wide "$WED" 18   "$OUT/more/wedding1"
wide "$WED" 7.7  "$OUT/more/wedding2"
wide "$WED" 32   "$OUT/more/wedding3"
wide "$WED" 49.5 "$OUT/more/wedding4"
echo ok
