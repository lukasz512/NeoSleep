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
- The intro plays once per session, and a reload restores the section.
- Every video has a poster, loads lazily, and never autoplays with sound.
- Mobile Lighthouse performance ≥ 85, with an image/video weight budget in CI.
- ES/EN key parity.
- No gradients, stars or testimonial blocks: a lint/visual rule mirrors the proposal's "evitar" list.

## Round 1 questions (in the Artifact)

D1 link/domain · D2 where the code lives · D3 phone experience · D4 lead tracking · D5 motion intensity (the proposal asks for *subtle*, while the first brief asked for *striking*).

## Next

1. Łukasz answers round 1 and drops the materials into the folder.
2. Scaffold, then build the vertical slice (Hero + Qué hacemos + case 01 Universal) in ES and EN, then show it to AJM before the remaining sections.
