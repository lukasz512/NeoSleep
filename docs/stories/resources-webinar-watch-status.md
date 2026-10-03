# Resources: webinar watch status + resume (NEO-209)

**As a** doctor using Recursos → Webinars, **I want** to see which OrthoApnea webinars I have already watched and continue a half-watched one from where I stopped, **so that** I don't have to remember it myself or scrub through an hour-long video.

## Decisions (Łukasz, 2026-10-03, decision form on the proposal Artifact)
- **D1 Resume:** ask first. A video with a saved position opens paused and offers "Continuar desde m:ss" or "Desde el inicio".
- **D2 Storage:** on the server (`resource_progress`, migration 043), per user, so progress follows the doctor across devices.
- **D3 Filter chips:** Todos / Sin ver / En curso / Vistos, with the last choice remembered per user (`@neo/prefs`, slot `view:resources:statusFilter`).
- **D4 Manual mark:** the tile ⋯ menu has "Marcar como visto" and "Marcar como no visto".
- **D5 No tracking:** there is no manager report (NEO-211 was canceled) and nothing records how a status was set. The status is only the user's own "what have I seen" hint, and nobody else can read it.

## Legal check (2026-10-03)
- The partner privacy notice (`apps/api/scripts/seed-content/partnerPrivacyNotice.{mx,pl}.html`) already lists "historial de uso" / "historia korzystania z Platformy" among account data. Its purposes include "administrar su cuenta en la Plataforma" (PL: Art. 6(1)(b)).
- Showing a user their own watched list is part of managing their account: a primary purpose, with no profiling and no third party. No consent and no change to the Contrato de Colaboración are needed.
- Optional at the notice's next revision: one sentence saying that the Platform remembers which training materials the user has viewed, only to show them that status.

## Rules (each one has a test)
- Under 10 s watched → Sin ver. Started → En curso (x %, measured to the furthest point reached). 90 % or the end → Visto.
- Visto is sticky: rewatching only moves the resume position.
- No resume prompt under 10 s or in the last 5 % of the video.
- The position is saved every 10 s of playback, on pause, on end and when the player closes.
- ES/EN/DE versions of a webinar share one progress (the merged partner id).
- Every user has their own progress, and no endpoint returns another user's.

## Acceptance criteria
- [ ] Each tile shows Sin ver / En curso (x %) / Visto, with a progress bar.
- [ ] The page and each section show "N de M vistos".
- [ ] Closing a video at 4:12 and reopening it offers to continue from 4:12.
- [ ] Watching 90 % marks the video Visto.
- [ ] The progress API integration tests run against a real Postgres.
