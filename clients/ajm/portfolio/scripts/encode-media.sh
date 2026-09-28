#!/usr/bin/env bash
# Encodes AJM's original footage and photos into web-weight assets.
#
#   AJM_MATERIALS=~/Documents/Private/AJM-materials pnpm --filter @ajm/portfolio media
#
# Originals never enter git. Output goes to public/media (gitignored) for local dev;
# in production the same tree is uploaded to the Cloudflare R2 bucket (decision R5).
#
# Budgets (story CORE-47): silent loops 0.3-2 MB, stills 20-80 KB AVIF + JPEG fallback,
# every visual has a 360p / 640 px variant for weak connections.
set -euo pipefail

SRC="${AJM_MATERIALS:-$HOME/Documents/Private/AJM-materials}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/media"
FF=(ffmpeg -v error -y)

mkdir -p "$OUT/hero" "$OUT/universal" "$OUT/planeta"

# ---- helpers -------------------------------------------------------------

# loop <input> <start> <duration> <filter> <height> <crf> <output>
loop() {
  "${FF[@]}" -ss "$2" -t "$3" -i "$1" -an -vf "$4,scale=-2:$5,fps=24" \
    -c:v libx264 -preset slow -crf "$6" -profile:v high -pix_fmt yuv420p -movflags +faststart "$7" < /dev/null
}

# still <input> <seconds-or-empty> <width> <output-base>  → .avif + .jpg
still() {
  local seek=()
  [ -n "$2" ] && seek=(-ss "$2")
  "${FF[@]}" ${seek[@]+"${seek[@]}"} -i "$1" -frames:v 1 -vf "scale=$3:-2" -q:v 5 "$4.jpg" < /dev/null
  "${FF[@]}" -i "$4.jpg" -frames:v 1 -c:v libsvtav1 -crf 36 -pix_fmt yuv420p "$4.avif" < /dev/null 2>/dev/null
}

# photo <input> <output-base>: 640 px always, 1280 px only when the original is big enough.
photo() {
  local tmp
  tmp="$(mktemp -t ajm).jpg"
  sips -s format jpeg "$1" --out "$tmp" >/dev/null
  local w
  w="$(sips -g pixelWidth "$tmp" | awk '/pixelWidth/ {print $2}')"
  still "$tmp" "" 640 "$2-640"
  if [ "$w" -ge 1600 ]; then still "$tmp" "" 1280 "$2-1280"; fi
  rm -f "$tmp"
}

MENDEL="$SRC/Mendel/Evento Mendel Viajes - Lanzamiento en CDMX..mp4"
EFD19="$SRC/privalia/eFashionDay_Eventprivalia.mp4"
MAKING="$SRC/privalia/Making Of eFashion Day 2020 2.mov"
UNIV="$SRC/universal/universalpopupstore.MOV"
MENDEL_CROP="crop=1920:826:0:128"
EFD19_CROP="crop=1280:576:0:72"

# ---- hero: 12 s montage (Mendel room → eFashion stage → making-of → Mendel stage) --------
TMP="$(mktemp -d)"
FILL="scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1"
loop "$MENDEL" 1   3 "$MENDEL_CROP,$FILL" 720 18 "$TMP/a.mp4"
loop "$EFD19" 203  3 "$EFD19_CROP,$FILL"  720 18 "$TMP/b.mp4"
loop "$MAKING" 58  3 "$FILL"              720 18 "$TMP/c.mp4"
loop "$MENDEL" 50  3 "$MENDEL_CROP,$FILL" 720 18 "$TMP/d.mp4"
printf "file '%s'\n" "$TMP/a.mp4" "$TMP/b.mp4" "$TMP/c.mp4" "$TMP/d.mp4" > "$TMP/list.txt"
"${FF[@]}" -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/montage.mp4"
loop "$TMP/montage.mp4" 0 12 "null" 720 28 "$OUT/hero/loop-720.mp4"
loop "$TMP/montage.mp4" 0 12 "null" 360 30 "$OUT/hero/loop-360.mp4"
still "$TMP/montage.mp4" 4.5 1280 "$OUT/hero/poster"
still "$TMP/montage.mp4" 4.5 640 "$OUT/hero/poster-640"
rm -rf "$TMP"

# ---- Universal: vertical walk-through (first 18 s) + room posters ----------------------
loop "$UNIV" 0 18 "null" 1280 31 "$OUT/universal/walk-720.mp4"
loop "$UNIV" 0 18 "null" 640  32 "$OUT/universal/walk-360.mp4"
still "$UNIV" 3  720 "$OUT/universal/lounge"
still "$UNIV" 12 720 "$OUT/universal/collection"
still "$UNIV" 40 720 "$OUT/universal/meeting"

# ---- Grupo Planeta: every photo, sized by what the original can carry --------------------
find "$SRC/planeta" -type f \( -iname '*.jpg' -o -iname '*.heic' \) | while read -r f; do
  base="$(basename "$f")"
  name="${base%.*}"
  ext="$(echo "${base##*.}" | tr 'A-Z' 'a-z')"
  # planeta14 exists as both .jpg and .HEIC: keep the HEIC (original), skip the jpg copy.
  if [ "$name" = "planeta14" ] && [ "$ext" = "jpg" ]; then continue; fi
  photo "$f" "$OUT/planeta/$name"
done

du -sh "$OUT"/*
