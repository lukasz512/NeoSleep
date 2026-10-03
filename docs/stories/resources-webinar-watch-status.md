# Resources: webinar watch status + resume (NEO-209)

**As a** doctor using Recursos → Webinars, **I want** to see which OrthoApnea webinars I have already watched and continue a half-watched one from where I stopped, **so that** I don't have to remember it myself or scrub through an hour-long video.

## Decisions (Łukasz, 2026-10-03, decision form on the proposal Artifact)
- **D1 Resume:** ask first. A video with a saved position opens paused and offers "Continuar desde m:ss" or "Desde el inicio".
- **D2 Storage:** on the server (`resource_progress`, migration 041), per user, so progress follows the doctor across devices. The manager team report was split out as **NEO-211** because it needs a privacy note for doctors first.
- **D3 Filter chips:** Todos / Sin ver / En curso / Vistos, with the last choice remembered per user (`@neo/prefs`, slot `view:resources:statusFilter`).
- **D4 Manual mark:** the tile ⋯ menu has "Marcar como visto" and "Marcar como no visto". `status_source` records `watched` vs `marked` so NEO-211 can tell the two apart.

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
