# CORE-47 — AJM Corporate Events Landing (ES/EN)

> Client: **AJ Management (AJM)**. Founder & Director: Alfred Jan Díaz. Offices in Mexico City and Madrid, plus international work.
> Tracked in Linear **CORE-47** until an AJM team exists; the ticket then moves to AJM.
> Status: **planning**. Decisions round 1 is open and the photos and videos are still to come.

## The ask

A selective, editorial **credentials landing** about AJM's corporate events, production and operations only. AJM sends it to leads. Within a few seconds a visitor should understand:
- what AJM does
- the level of projects it can run
- which brands it has worked with
- who personally leads each project

It comes in Spanish and English. In its feel it is closer to an international production company's credentials deck than to an agency website.

## Sources

| Source | State |
|---|---|
| Client proposal "Eventos Corporativos & Experiencias — Propuesta de contenido y diseño para Landing Page" (ES) | **Received 2026-09-28 (pasted in chat). This is the source of truth for structure and copy.** |
| Current site https://alfredjan.com/portfolio/ | Reviewed. Serves as reference for facts and older projects |
| Client note on the current site: "se queda universal, e fashion day, glamour" | Folded in: Universal is case 01, and eFashion Day and Glamour Beauty Week become chapters of the **Privalia** timeline (case 03). Both were Privalia events |
| Photos / videos | Coming from Łukasz (see "Materials") |

## Visual direction (from the proposal)

- Modern, premium and minimal: **warm white + charcoal**, large-format type, lots of white space, full-screen event photography.
- **Subtle motion.** No gradients, no icon clutter, no endless service lists, no generic testimonials, stars or unsupported superlatives.
- Photography leads, copy is short. The overall impression should be *selective, international, operationally solid, personally led*.

## Narrative (9 sections)

| # | Section | Content (proposal) | Motion proposal |
|---|---|---|---|
| 01 | Hero | "Creamos experiencias que conectan a las personas." Eventos Corporativos · Experiencias · Producción. CTA "Conoce nuestro trabajo ↓" | Full-screen muted video loop (or 3–5 photos crossfading). The headline rises line by line through a text mask. On first load a thin line draws across and opens into the image. |
| 02 | Qué hacemos | "Grandes ideas. Ejecución impecable." + 6 words: Estrategia / Planeación / Producción / Logística / Experiencias / Ejecución | Typographic only. The 6 words light up one by one as you scroll, charcoal on warm white. |
| 03 | Capacidades | 6 numbered modules on a dark background. "Un solo partner. De la planeación a la ejecución." | Big numbers 01–06. On hover or focus a small detail photo slides in behind the number: lighting, backstage, stage and so on. |
| 04 | Proyectos | 4 editorial cases: Universal · Grupo Planeta · Privalia · Mendel | Each case opens with its lead image revealed by a wipe (clip-path), then 3–6 images in an editorial grid with slight parallax. |
| 04.3 | Privalia | "Una colaboración construida a través del tiempo." | A **scroll-driven timeline**: eFashion Day 2019–21 → Vogue Shopping Week 2022–24 → Glamour Beauty Week → today. Years tick past like an odometer. |
| 05 | Cómo trabajamos | 6 stages Brief → Cierre. "Un solo punto de contacto." | A **pinned horizontal scroll**: a single line runs through the 6 stages and fills in as you go. |
| 06 | Clientes | 4 logos only, monochrome, large | Logos fade in with a small stagger. No logo wall. |
| 07 | Sobre AJM | "Experiencia local. Perspectiva internacional." CDMX / Madrid / Internacional | 3 cities as large type. A thin line connects them. |
| 08 | Alfred Jan Díaz | Quote + bio, portrait at ~40%, LinkedIn | The portrait reveals from bottom to top, and the quote sets in as a pull-quote. |
| 09 | Contacto | "¿Tienes un evento en mente?" CTA "Hablemos de tu proyecto →" | Full-bleed event photo and one oversized CTA. Email · WhatsApp · LinkedIn · Instagram. |

**Page (re)load:** the intro (line draw → image) plays only on the first visit in a session. A reload restores your section with no intro, so it never feels slow twice.

## Materials

**Where to put them:** a folder outside the repo and outside `~/Downloads` (macOS blocks Claude there), e.g. `~/Documents/Private/AJM-materials/`, with one subfolder per section: `hero/ universal/ planeta/ privalia/ mendel/ alfred/ logos/ extra/`.

**Video is welcome, however heavy.** Send the original files: 4K, ProRes and large MP4s are all fine. The originals are never committed to git and never served as they are. The build transcodes each one to web versions:
- hero loop: 8–15 s, 1080p, H.264 + WebM, roughly 3–6 MB, muted, with a poster frame
- case videos: adaptive streaming (HLS) from a video CDN (Cloudflare Stream / Bunny), loaded only when the section is near

Photos should also be originals (JPG/HEIC/RAW exports at full resolution). The build produces AVIF/WebP in several sizes.

Checklist (from the proposal): hero 1 video or 3–5 photos · Universal 5–10 · Grupo Planeta 5–10 from the 2–3 strongest projects (Gandhi, Reforma 87, Museo Tamayo) · Privalia 4–8 across different years · Mendel 5–10 · 1 vertical portrait of Alfred · logos for AJM, Universal P&E, Grupo Planeta, Privalia and Mendel (vector or transparent PNG) · optional backstage/detail shots.

## Link name options (pending D1)

- `…/corporativo` · `…/corporate`, i.e. one short word per language
- `…/es/eventos-corporativos` · `…/en/corporate-events`, SEO-friendly but long
- `corporate.<domain>`, a subdomain that is easy to host separately
- Per-lead add-on: `…?for=mendel` → "Preparado para Mendel"

The domain is still open: alfredjan.com or a dedicated AJ Management domain.

## Architecture (pending D2)

- A new static site, isolated from every other client: **no** `@neo/*` UI, brand or stores, and no API or DB in v1.
- Shares only the toolchain: pnpm catalog versions (Vue 3.5, Vite, TS strict, Vitest, ESLint).
- Motion: GSAP + ScrollTrigger and Lenis, bundled from npm, with every effect behind `prefers-reduced-motion`.
- Copy in the app's own `locales/es.json` + `en.json`. Spanish is the source, since the client wrote ES.
- Media pipeline: originals → build-time image variants plus a video CDN. Nothing heavy goes into the bundle or the repo.
- Hosting: static (Cloudflare Pages or similar) with its own deploy workflow.

## Decided without asking (each proven by a test)

- `prefers-reduced-motion` → no scroll choreography, crossfades only.
- `/es` and `/en`, with the first visit redirected by browser language and a toggle kept.
- The entry plays on a new session (QR variant when `?src=qr`), and a reload skips it and restores the section.
- Nothing is logged per lead before consent, and "reject" leaves the page fully working.
- Every video has a poster, loads lazily, and never autoplays with sound.
- Mobile Lighthouse performance ≥ 85, with an image/video weight budget in CI.
- ES/EN key parity.
- No gradients, stars or testimonial blocks: a lint/visual rule mirrors the proposal's "evitar" list.

## Decisions — round 1 (Łukasz, 2026-09-28, as clicked)

| # | Question | Answer |
|---|---|---|
| D1 | Link / domain | **yes**: `alfredjan.com/corporativo` (ES) + `/corporate` (EN) |
| D2 | Where the code lives | **more**: a new top-level `clients/ajm/` folder in this repo with its own deploy. A lint rule blocks `@neo/*` imports |
| D3 | Phone experience | **more**: stories mode on phones. Note: *many visits will come from phones via a QR code. A QR arrival should get an entry animation built around the QR, so it is visible. A plain link gets no QR, just a ~1.5 s catchy entry animation. Cookie consent is required.* |
| D4 | Lead tracking | **more**: per-lead opens logged in neoCRM |
| D5 | Motion intensity | **more**: a quiet base plus one signature move per section |

Consequences:
- **Two entry animations** (replaces the "intro once per session" default):
  - `?src=qr` (every QR code carries it) → a QR-themed entry of about 2 s
  - any other link → an entry of about 1.5 s with no QR
  - either way, a reload within the session skips the entry and restores the section
- **Phone = stories**: one section per story with progress bars; tap or swipe advances. Desktop keeps the editorial scroll.
- **Per-lead logging (D4)** needs (a) a per-lead identifier in the URL/QR, (b) a neoCRM API endpoint that records opens, and (c) consent first. This touches `apps/api` (neoCRM is the platform), while the site itself still imports nothing from `@neo/*`.
- **Contradiction to settle (round 2):** D1 chose the plain link without the per-lead `?for=` variant, but D4 needs to know *which* lead opened it. See R1.

## Materials review (2026-09-28) and one treatment per case

Łukasz: *"no more photos: work with what we have; where there's only video, focus on video. Each case slightly different."*

| Case | What exists | Treatment |
|---|---|---|
| Universal P&E | 1 vertical iPhone video, 69 s, 1080×1920, a walk-through of the pop-up with no people | **Walk-through**: the video in a tall portrait frame, advanced by scroll on desktop, with room names rolling in beside it; full-screen story on phones |
| Grupo Planeta | ~18 photos: 4 sharp 4032 px, ~10 small 1280 px (WhatsApp-compressed), 1 collage | **Bookshelf**: a horizontal drag gallery of event "spines" (Crónicas, México Bizarro, Bordes, gala) that open into photos; small photos only shown small |
| Privalia | 4 videos: eFashion Day 2019 recap (4 min, 720p), 2020 streaming (4 min), making-of 2020 (1:42), brand film (1:00); 1 photo | **Timeline with video chapters**: 6–8 s silent loops per year and "Watch" for the full film in a lightbox |
| Mendel | 1 edited video, 100 s, 1080p, lower-thirds burned in | **Highlight reel**: full-bleed muted reel, unmute, stat overlays on beats, a frame strip to jump |
| Hero | nothing dedicated | A 10–12 s montage cut from the videos above |

Findings: the Mendel and eFashion videos have letterbox bars baked in, which get cropped at encode. (An earlier note claiming `planeta4.jpg` was from eFashion Day was wrong. The encoded files confirm Łukasz's photo→event list.) Logo: `Dokumenty/AJ Management/logo/logo-white.svg`, one version, recoloured to charcoal/white from the same file.

## Weak-connection delivery (measured)

- Silent 8 s loop from the Mendel footage: **0.9 MB at 720p, 0.26 MB at 360p** (H.264, CRF 28–30, faststart, no audio).
- Full films: an HLS ladder at 360/540/720/1080p.
- Posters and photos: AVIF + WebP in 3 widths, with a ~1 KB blurred placeholder inline.
- Nothing video loads before its section is near. With Save-Data, 2G/3G or a slow first byte, loops are replaced by posters with a play button.
- Budget: first screen ≤ 300 KB.
- ffmpeg is installed on Łukasz's Mac (Homebrew) for the encode pipeline.

## Still needed from AJM

Alfred's portrait · permission to show the brands and footage publicly (Universal is often under NDA) · client logos (or names in type) · contact details (email, WhatsApp, LinkedIn, Instagram) · access to alfredjan.com DNS/hosting · one line of facts per case · approval of the EN copy.

## Decisions — round 2 (Łukasz, 2026-09-28, as clicked)

| # | Question | Answer |
|---|---|---|
| R1 | Per-lead identifier | **no**: no per-lead code, aggregate only |
| R2 | Consent model | **more**: cookieless totals always, per-lead only after Accept |
| R3 | QR entry animation | **more**: QR squares become a photo mosaic. Note: *check the device, and skip it when the device is weak; in fact it could be a single photo* |
| R4 | Where lead QR/links are made | **no**: manually, from a list Łukasz keeps |
| R5 | Video hosting | **yes**: self-encoded HLS + loops on Cloudflare R2 |

Consequences:
- **Tracking = cookieless aggregate only** (visits, time, which case is viewed). R1 and R4 remove per-lead identification, so D4's "per-lead in neoCRM" and R2's "per-lead after Accept" have nothing to act on. There is **no neoCRM API endpoint** and no `@neo/*` touchpoint at all. **Confirmed (C1, 2026-09-28): more, i.e. aggregate + a small footer privacy notice, no banner.**
- **Consent:** with nothing per-lead and no cookies, a blocking banner is not legally required. The plan is a short privacy notice in the footer (ES/EN). If Łukasz still wants a banner for looks or trust, it is cheap to add.
- **QR entry (R3):** the QR grid is cut from **one** hero photo (each square shows its slice), then the squares fly apart into the full photo. It is skipped for a simple fade when `prefers-reduced-motion`, Save-Data, `navigator.deviceMemory < 4`, `hardwareConcurrency < 4` or a slow connection is detected.
- **Hosting:** Cloudflare R2 bucket + CDN for loops, HLS and images. The originals never leave Łukasz's Mac and git.

## Planeta events → photos (Łukasz, 2026-09-28)

Colección Bordes 2024: 11, 4, 2, 12 · Novedades 2025: 5, 10 · Novedades 2024: 13, 14, 15, 1, 3, 8, 9 · Crónicas de la capital: 00, 7 · Algún día, hoy 2019: 22 · Duelo de historias: 20, 21, 18, 17. The source of truth is `clients/ajm/portfolio/src/content/planeta.ts`.

## Scope change (Łukasz, 2026-09-28)

- **No Alfred section for now**: projects only.
- Contact: aj@alfredjan.com · WhatsApp 55 1745 8958 (+52) · Instagram @alfredjan.

## Slice 1: built (2026-09-28)

`clients/ajm/portfolio` (Vite + Vue + TS, `@ajm/portfolio`):
- entry: QR mosaic from one photo, link line/AJ, fade on lite
- hero (12 s montage loop)
- Qué hacemos (words light up on scroll)
- Universal walk-through (vertical loop + rooms in step)
- Planeta bookshelf (6 events, real photos)
- contact (WhatsApp prefilled, email, Instagram)
- footer privacy notice
- ES/EN via `/corporativo` · `/corporate`, or `?lang=` in static previews

Supporting pieces:
- Media pipeline: `scripts/encode-media.sh` (ffmpeg + sips).
- Repo wiring: `clients/*/*` added to the pnpm workspace, ESLint blocks neoCRM imports, pre-commit/pre-push/quality-gate/affected-workspaces include clients, and CI runs `@ajm/portfolio` tests.
- Preview: `pnpm --filter @ajm/portfolio build:preview` builds a static copy with relative paths, published as a private Artifact.

Not yet: Privalia timeline, Mendel reel, Capacidades, Cómo trabajamos, Clientes, Sobre, phone stories mode (D3), aggregate analytics, R2 upload + deploy to alfredjan.com.

## Next (remaining)

Scaffold `clients/ajm/portfolio` (Vite + Vue + TS, GSAP/Lenis, own ES/EN locales, lint rule blocking `@neo/*`), then build the vertical slice: entry (QR + link) → hero montage → Qué hacemos → Universal walk-through, in ES + EN, weak-network rules on.

## Next

1. Łukasz answers round 1 and drops the materials into the folder.
2. Scaffold, then build the vertical slice (Hero + Qué hacemos + case 01 Universal) in ES and EN, then show it to AJM before the remaining sections.
