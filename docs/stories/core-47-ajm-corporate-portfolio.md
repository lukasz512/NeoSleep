# CORE-47 — AJM Corporate Events Portfolio (ES/EN)

> Client: **AJ Management (AJM)**, Alfred Jan, international events producer, Madrid.
> Tracked in Linear **CORE-47** until an AJM team exists; the ticket then moves to AJM.
> Status: **planning** — questions round 1 open, remaining client materials pending.

## The ask

A portfolio-style landing, not a full website, that AJM sends to leads as a presentation for
**corporate events** prospects. Spanish and English. It must feel like a production, not a brochure:
flow, animations, transitions and page (re)load are part of the pitch.

## Sources

| Source | State |
|---|---|
| Current site https://alfredjan.com/portfolio/ | Reviewed 2026-09-28 (9 sections, ~50 photos inlined as base64 in one 4.8 MB HTML page, videos behind "Watch" links) |
| `AJ_Management_Propuesta_Landing_Eventos_Corporativos_ES.docx` | **Not read yet**: macOS blocks Claude from `~/Downloads`. Needs to be moved into the repo or `~/Documents` |
| Client note | "De aquí se queda universal, e fashion day, glamour": keep **Universal Studios pop-up**, **eFashion Day**, **Glamour Beauty Week** |
| Raw videos/photos | Coming from the client |

## What stays: the three cases

| # | Case | Story in one line | Key numbers |
|---|---|---|---|
| 1 | Universal Studios: Pop-Up Experience, CDMX (2025) | Commissioned directly by the LA HQ, a two-week immersive retail pop-up running alongside 2 other projects | 2 weeks · 3 simultaneous projects · LA HQ direct |
| 2 | eFashion Day: E-commerce & Fashion Congress, Privalia MX (2019–2021) | A congress conceived, produced and directed by AJM, which moved from stage to hybrid streaming | 3 editions · 500 in person / 1,200+ online · PayPal, Banorte |
| 3 | Glamour Beauty Week × Privalia × Nuxe | An editorial beauty breakfast and masterclass for influencers and press | Condé Nast standard · Glamour, Privalia, Nuxe, Murad |

Dropped from this landing: Minions × Vogue Brazil, Hugo Boss × Privalia live shopping, Vogue Shopping Week, the Indian wedding, "More work". Open question: does the proposal doc add new corporate cases?

## Concept: "Every case is a production" (proposal, pending D5)

The page is one continuous production with a film-set grammar: slate → chapters → credits.

- **Entry / refresh = "Take N".** The page loads black and a clapper slate reads `AJM · CORPORATE · TAKE 07`, then it snaps open onto a full-bleed muted showreel. Each reload increments the take and picks a different hero clip, so refreshing feels intentional. A reload restores the chapter you were on.
- **Hero.** "Alfred Jan" in huge type works as a mask: the video plays *through* the letters, and on scroll the letters grow until the video fills the screen.
- **Chapter cuts.** Between cases there is a hard cut to black, a running timecode and a chapter slate (`01 / 03`), like an edit bay.
- **Case 1, Universal: "Doors open".** Scroll opens two panels like pop-up shop doors. Photos sit in 3D depth and you "walk in" (perspective parallax). The stats print as a ticket stub.
- **Case 2, eFashion Day: "On air".** A broadcast UI with a REC dot, timecode and lower-thirds for the stats. The switch from 2019 (stage) to 2020–21 (streaming) is a channel-change glitch. The event video plays inside a stage-screen frame.
- **Case 3, Glamour: "Table set".** An editorial magazine spread with a serif masthead in AJM's own type (no imitation of the Glamour logo). Scroll turns the page. Photos reveal through soft floral-shaped masks, and the table setting assembles top-down as you scroll.
- **Credits roll.** The Condé Nast titles, brands and partners roll like end credits.
- **Close.** "Ready to produce something memorable": email, WhatsApp, calendar link, and an optional PDF one-pager.
- **Phone (pending D3).** Leads open the link from WhatsApp, so on a phone the same content becomes a **stories format** (tap-through, progress bars, one chapter per story) instead of a long scroll.

## Link name options (pending D1, needs the AJM domain)

- `alfredjan.com/corporate` (recommended: short and readable aloud)
- `alfredjan.com/portfolio/corporate` (keeps the current path family)
- `corporate.alfredjan.com` (own subdomain, easiest to host separately)
- `alfredjan.com/es/corporate` + `/en/corporate` (language in the path)
- Per-lead variant on top of any of these: `…/corporate?for=banorte`, which greets the lead by company name

## Architecture (pending D2)

- A new static app, isolated from every other client: **no** `@neo/*` UI/brand/stores, no API, no DB in v1.
- Shares only the toolchain with the monorepo: the pnpm catalog versions (Vue 3.5, Vite, TS strict, Vitest, ESLint).
- Motion: GSAP + ScrollTrigger (scroll choreography) and Lenis (smooth scroll), loaded from npm, bundled.
- Copy in the app's own `locales/es.json` + `en.json`, **not** `packages/i18n`, because that package is the NeoSleep/neoCRM product copy.
- Media: videos on a streaming CDN (adaptive HLS plus poster frames) rather than in the bundle. The current site's 4.8 MB single HTML is the anti-pattern to avoid.
- Hosting: static (Cloudflare Pages or similar), with its own deploy workflow, separate from the GoDaddy FTP pipeline.

## Decided without asking (each proven by a test)

- `prefers-reduced-motion` → no scroll choreography, crossfades only.
- `/es` and `/en` routes, with the first visit redirected by browser language and a manual toggle kept.
- A reload restores the current chapter (sessionStorage) and increments the take number.
- Every video has a poster, loads lazily, and never autoplays with sound.
- Mobile Lighthouse performance ≥ 85 on the built page (CI budget).
- ES/EN key parity is enforced by a test.

## Round 1 questions (in the Artifact)

D1 link/domain · D2 where the code lives · D3 phone experience · D4 lead tracking · D5 creative concept.

## Next

1. Łukasz answers round 1 and moves the proposal `.docx` somewhere Claude can read.
2. The client sends raw videos/photos (ideally the originals, not the website JPEGs).
3. Scaffold the app, then build chapter 1 end-to-end as a vertical slice for AJM's feedback before chapters 2–3.
