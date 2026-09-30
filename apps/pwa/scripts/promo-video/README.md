# Promo video (NEO-204)

A 30-second LinkedIn teaser, built from real app screens. It uses fictional demo data only.

```bash
node apps/pwa/scripts/promo-video/capture.mjs            # screenshots of the real PWA, API stubbed from fixtures.mjs
node apps/pwa/scripts/promo-video/render.mjs --lang en   # → out/neosleep-teaser-en-4x5.mp4 (also: pl, mx)
node apps/pwa/scripts/promo-video/render.mjs --preview 3,9,15   # single frames for review
```

- `fixtures.mjs`: every patient, doctor and clinic in it is invented. Never point capture at a real API.
- `compose.html`: the whole timeline. `window.renderAt(t)` draws the frame at second `t`. The en/pl/mx copy lives in `COPY`.
- Opening photo: Pexels #7622509. The Pexels license allows free commercial use and needs no attribution. The first render downloads it.
- Music: a synthesized placeholder pad. Replace it with a licensed track before publishing.
