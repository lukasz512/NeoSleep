# NEO-151 — Resources: webinar tiles, posters, cinema sheet

**As** a doctor or rep browsing OrthoApnea webinars in Resources,
**I want** to see what each video is about and know it's loading when I open it,
**so that** I pick the right webinar and don't think the app froze during the long start.

## Decisions (Łukasz, 2026-09-28, from the NEO-151 mockup artifact)
- Option 2: title and flags on the poster tile, and a click opens a cinema sheet (a dialog on desktop, a bottom sheet on phone).
- Posters come from idea A: the API grabs one frame per video with ffmpeg and caches it (memory → Supabase Storage → ffmpeg).
- Spanish is labelled with Spain's flag, because the content is recorded in Spain.
- Idea B (ask OrthoApnea for thumbnails, duration and faststart files) is not part of this change.

## Acceptance criteria
1. There is one label above the grid ("Webinars" + count). There is no one-tab bar and no duplicate category heading.
2. The grid shows 3 tiles per row at ≥ 960 px, 2 at ≥ 600 px and 1 below that.
3. Each tile shows a real frame from the video, or a brand cover when there is none. A tile has no border and no player inside.
4. Languages show as flag + code. Spanish uses Spain's flag.
5. The video length shows on the tile once the API knows it.
6. The list shows a skeleton while loading, and tiles fade in one after another.
7. The sheet shows these states: loading (an honest message and seconds counter, which switches to "still loading" after 25 s), buffering, playing and error with Try again.
8. Only one video downloads at a time. Closing the sheet stops the download.
9. Posters never copy a whole video. ffmpeg reads only the index and one frame. A failure falls back to the cover and is retried after 10 minutes, not on every request.
10. A host without ffmpeg works as before: no posterUrl, and tiles show covers.

## Compliance
- Posters are derived frames of partner marketing/education content. No patient data is involved.
- They are stored in the existing private bucket under `resource-posters/orthoapnea/` and served only with a signed-in user's media token.
