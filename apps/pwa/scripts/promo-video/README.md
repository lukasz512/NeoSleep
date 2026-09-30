# Promo video (NEO-204)

A 30-second LinkedIn teaser, built from real app screens. It uses fictional demo data only.

```bash
node apps/pwa/scripts/promo-video/capture.mjs            # screenshots of the real PWA, API stubbed from fixtures.mjs
node apps/pwa/scripts/promo-video/render.mjs --lang en   # → out/neosleep-teaser-en-4x5.mp4 (also: pl, mx)
node apps/pwa/scripts/promo-video/render.mjs --preview 3,9,15   # single frames for review
```

Length: `--duration 15|20|30` (default 30). Every scene stays; the shorter cuts only make each one shorter. The chosen cut is music only, with no voice.

Voice-over (kept for later use, not in the current cut): `node apps/pwa/scripts/promo-video/voice.mjs --lang en --in out/neosleep-teaser-en-4x5-calm.mp4` adds the lines from `voiceover.json` (draft system voices) and ducks the music under them. It writes `…-vo-draft.mp4` and does not re-render the picture.

- `fixtures.mjs`: every patient, doctor and clinic in it is invented. Never point capture at a real API.
- `compose.html`: the whole timeline. `window.renderAt(t)` draws the frame at second `t`. The en/pl/mx copy lives in `COPY`.
- Opening photo: Pexels #7622509. The Pexels license allows free commercial use and needs no attribution. The first render downloads it.
- Music: a synthesized placeholder pad. Replace it with a licensed track before publishing.
