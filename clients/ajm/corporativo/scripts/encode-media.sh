#!/usr/bin/env bash
# Encodes AJM's original footage and photos into web-weight assets.
#
#   AJM_MATERIALS=~/Documents/Private/AJM-materials pnpm --filter @ajm/corporativo media
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

mkdir -p "$OUT/hero" "$OUT/universal" "$OUT/planeta" "$OUT/privalia" "$OUT/mendel" "$OUT/capabilities"

# ---- helpers -------------------------------------------------------------

# loop <input> <start> <duration> <filter> <height> <crf> <output>
loop() {
  "${FF[@]}" -ss "$2" -t "$3" -i "$1" -an -vf "$4,scale=-2:$5,fps=24" \
    -c:v libx264 -preset slow -crf "$6" -profile:v high -pix_fmt yuv420p -movflags +faststart "$7" < /dev/null
}

# still <input> <seconds-or-empty> <width> <output-base> [crop-filter]  → .avif + .jpg
still() {
  local seek=()
  [ -n "$2" ] && seek=(-ss "$2")
  "${FF[@]}" ${seek[@]+"${seek[@]}"} -i "$1" -frames:v 1 -vf "${5:-null},scale=$3:-2" -q:v 5 "$4.jpg" < /dev/null
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

# ---- hero: 12 s montage, text- and logo-free shots only ---------------------------------
# Łukasz (2026-09-28): no lower-thirds, titles or brand logos in the hero. Every window below
# was checked frame by frame (1 fps contact sheets) against the originals.
# audience (eFashion 2019) → backstage hands (making-of 2020) → dinner hall (eFashion 2019)
# → guests talking (Mendel) → wardrobe detail (making-of 2020)
TMP="$(mktemp -d)"
FILL="scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1"
loop "$EFD19"  146 2.5 "$EFD19_CROP,$FILL"  720 18 "$TMP/a.mp4"
loop "$MAKING"  40.55 2.5 "$FILL"            720 18 "$TMP/b.mp4"
loop "$EFD19"  102.8 2.5 "$EFD19_CROP,$FILL"  720 18 "$TMP/c.mp4"
loop "$MENDEL"  34 2.5 "$MENDEL_CROP,$FILL" 720 18 "$TMP/d.mp4"
loop "$MAKING"  16 2   "$FILL"              720 18 "$TMP/e.mp4"
printf "file '%s'\n" "$TMP/a.mp4" "$TMP/b.mp4" "$TMP/c.mp4" "$TMP/d.mp4" "$TMP/e.mp4" > "$TMP/list.txt"
"${FF[@]}" -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/montage.mp4"
loop "$TMP/montage.mp4" 0 12 "null" 720 28 "$OUT/hero/loop-720.mp4"
loop "$TMP/montage.mp4" 0 12 "null" 360 30 "$OUT/hero/loop-360.mp4"
still "$TMP/montage.mp4" 6 1280 "$OUT/hero/poster"
still "$TMP/montage.mp4" 6 640 "$OUT/hero/poster-640"
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

# ---- Privalia: one loop per year + the eFashion Day 2019 photos -------------------------
FILL_W="scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1"
loop "$EFD19"   27 3 "$EFD19_CROP,$FILL_W" 720 29 "$OUT/privalia/y2019-720.mp4"
loop "$EFD19"   27 3 "$EFD19_CROP,$FILL_W" 360 31 "$OUT/privalia/y2019-360.mp4"
still "$EFD19" 28 1280 "$OUT/privalia/y2019-poster" "$EFD19_CROP"
loop "$MAKING"  40.55 3.2 "$FILL_W" 720 29 "$OUT/privalia/y2020-720.mp4"
loop "$MAKING"  40.55 3.2 "$FILL_W" 360 31 "$OUT/privalia/y2020-360.mp4"
still "$MAKING" 41 1280 "$OUT/privalia/y2020-poster"
# every event shows at least 2 photos (Łukasz, 2026-09-28): 2020 has no photos, so two clean
# frames of the studio — the wide LED stage and the neon-ring interview
still "$MAKING" 63.6 1280 "$OUT/privalia/y2020a-1280"
still "$MAKING" 63.6 640  "$OUT/privalia/y2020a-640"
still "$MAKING" 87.3 1280 "$OUT/privalia/y2020b-1280"
still "$MAKING" 87.3 640  "$OUT/privalia/y2020b-640"
find "$SRC/privalia" -type f -iname 'privalia*.jpg' | while read -r f; do
  base="$(basename "$f")"
  photo "$f" "$OUT/privalia/${base%.*}"
done

# ---- Mendel: highlight reel from the clean windows (no lower-thirds, no logo) ------------
TMP="$(mktemp -d)"
# Clean windows (checked at 1 fps): 34–36.8 s and 46.5–48.8 s. Everything else carries
# lower-thirds, "¿Cuál será tu próximo destino?" signage or the Mendel/partner logos.
loop "$MENDEL" 34 2.8 "$MENDEL_CROP,$FILL_W" 720 18 "$TMP/a.mp4"
loop "$MENDEL" 46.5 2.3 "$MENDEL_CROP,$FILL_W" 720 18 "$TMP/b.mp4"
printf "file '%s'\n" "$TMP/a.mp4" "$TMP/b.mp4" > "$TMP/list.txt"
"${FF[@]}" -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/reel.mp4"
loop "$TMP/reel.mp4" 0 5 "null" 720 28 "$OUT/mendel/reel-720.mp4"
loop "$TMP/reel.mp4" 0 5 "null" 360 30 "$OUT/mendel/reel-360.mp4"
still "$TMP/reel.mp4" 3.5 1280 "$OUT/mendel/poster"
still "$TMP/reel.mp4" 3.5 640 "$OUT/mendel/poster-640"
still "$MENDEL" 3.5  640 "$OUT/mendel/f1" "$MENDEL_CROP"
still "$MENDEL" 4.8  640 "$OUT/mendel/f2" "$MENDEL_CROP"
still "$MENDEL" 58.5 640 "$OUT/mendel/f3" "$MENDEL_CROP"
rm -rf "$TMP"

# ---- Contacto: the strongest stage (eFashion Day Live 2020 studio), Łukasz: "a beautiful stage,
# like a Mindvalley event". Wide LED stage 62.9–64.7 s → neon-ring interview + wide studio 86–88.6 s;
# both windows are free of titles and logos (2 fps check).
TMP="$(mktemp -d)"
loop "$MAKING" 62.9 1.8 "$FILL_W" 720 18 "$TMP/a.mp4"
loop "$MAKING" 86   2.6 "$FILL_W" 720 18 "$TMP/b.mp4"
printf "file '%s'\n" "$TMP/a.mp4" "$TMP/b.mp4" > "$TMP/list.txt"
"${FF[@]}" -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/stage.mp4"
mkdir -p "$OUT/contact"
loop "$TMP/stage.mp4" 0 4.4 "null" 720 28 "$OUT/contact/stage-720.mp4"
loop "$TMP/stage.mp4" 0 4.4 "null" 360 30 "$OUT/contact/stage-360.mp4"
rm -rf "$TMP"
still "$MAKING" 63.6 1280 "$OUT/contact/stage-poster"
still "$MAKING" 63.6 640 "$OUT/contact/stage-poster-640"

# ---- Capacidades: one detail still per module (behind the big numbers) -------------------
# Each still says what its module is (Łukasz, 2026-09-28: the first cut didn't):
# 01 corporate events → a full conference audience · 02 executive → the stage interview
# 03 teams → the long dinner tables · 04 production → the sound desk
# 05 logistics → the courtyard seating plan from above · 06 venues → the Bordes palace room
# Corporate Events: the eFashion 2019 courtyard full of guests, cropped below the event logo (round 8)
still "$SRC/privalia/privalia03.jpg" "" 960 "$OUT/capabilities/c1" "crop=iw*0.72:ih*0.7:iw*0.28:ih*0.3"
still "$MAKING" 86.2 960 "$OUT/capabilities/c2"
still "$EFD19" 103  960 "$OUT/capabilities/c3" "$EFD19_CROP"
still "$MAKING"  41 960 "$OUT/capabilities/c4"
still "$SRC/privalia/privalia01.jpg" "" 960 "$OUT/capabilities/c5"
still "$SRC/planeta/planeta12.JPG" "" 960 "$OUT/capabilities/c6"

# ---- Clientes: one-colour logo masks ------------------------------------------------------
AJM_MATERIALS="$SRC" bash "$(dirname "$0")/encode-logos.sh" > /dev/null

du -sh "$OUT"/*
