# Doctor user guide (PDF)

The "Guía de uso" in Resources (`apps/pwa/public/files/guia-uso-neosleep.pdf`) is built from this folder. It is a 16:9 deck: one task per slide, a real screenshot with numbered markers, and the matching steps.

| File | What it holds |
|---|---|
| `slides.mjs` | `DECK` (slide order), `CHAPTERS`, and `SHOTS`: one recipe per screenshot (where to go, what to fill in, which elements get marker 1, 2, 3…) |
| `content/<locale>.json` | All text. `en.json` is the source; `mx.json` is what ships today. `meta.date` is the edition date |
| `shots/<locale>/` | Screenshots + marker boxes, committed, so text-only changes need no running app |
| `build.mjs`, `deck.css` | HTML template → PDF via Playwright |

## Change the text only

```bash
pnpm guide:build                 # → apps/pwa/public/files/guia-uso-neosleep.pdf
pnpm guide:build --png /tmp/p    # also one PNG per slide, for review
```

The build fails when a slide has a different number of steps than markers on its screenshot.

## Retake the screenshots (after a UI change)

Needs a local stack. Never point it at dev or prod: the seed and the shots refuse anything but localhost.

1. `docker run -d --name guide-pg -e POSTGRES_PASSWORD=postgres -p 55420:5432 postgres:15`
2. Worktree `.env`: `DATABASE_URL=postgresql://postgres:postgres@localhost:55420/postgres`, `PORT=3420`, `DEFAULT_TENANT_SLUG=neosleep`, `SESSION_SECRET=<any>`, `LOGIN_RATE_LIMIT_MAX=1000`, `ORTHOAPNEA_EMAIL=` and `ORTHOAPNEA_PASSWORD=` (empty, so nothing reaches the lab).
3. Build the shared packages once: `pnpm --filter "./packages/*" build`.
4. API: `cd apps/api && npx tsx --env-file=../../.env src/server.ts`. PWA: `cd apps/pwa && VITE_DEV_API_TARGET=http://localhost:3420 npx vite --port 5420`.
5. `docs/user-guide/reset-local.sh`: fresh schema + demo doctor (Dra. Lorena Demo) + Tester Patient-1…4. Run it before **every** shots run: the QR shot creates a real questionnaire request.
6. `pnpm guide:shots`, then `pnpm guide:build`.

The API allows 1000 requests per 15 minutes per IP. After a few runs, restart it.

## Rules the guide follows

- No partner or lab brand names on screen or in the text. Device products are stubbed with neutral names.
- Clinical content is quoted from the Care protocol (`docs/clinical/protocolo-atencion/`) with its source, never paraphrased.
- No `box-shadow` in `deck.css`: macOS Preview draws it as a grey box. Check PDF pages in Preview, not only the PNG previews.
