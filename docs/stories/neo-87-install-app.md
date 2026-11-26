# NEO-87 — Install NeoSleep on the user's device

**Who**: every signed-in user (doctors first — they don't know the words "PWA" or "install web app").
**Why**: one icon on the phone/tablet/computer, full-screen window, no remembering the address.

## Decisions (Łukasz, 2026-09-26)

Chosen from the variants page (https://claude.ai/artifact/9qxjFZaJJwayHBihsvEV2a): **C + E + F**.

- **C** — a card after login proposes adding the app (bottom sheet on phones/tablets, dialog on computers).
- **E** — a permanent "Add …" row in the avatar menu, so a user who said "Later" can still do it.
- **F** — on a computer the card also shows a **QR code only** (no SMS) to open NeoSleep on the phone.
- **"Later"** → the card comes back **once after 7 days**, then never again (the menu row stays).
- **Wording**: "Add", never "install"/"PWA", and **tailored to the detected device**: phone, tablet or computer, with Mac and Windows both supported.
- The small app-bar pill from the first iteration is removed (C + E replace it).

## How each device installs

| Device / browser | How | What we show |
|---|---|---|
| Android (Chrome, Edge, Samsung) | native install dialog | button → system dialog |
| Windows / Mac — Chrome, Edge | native install dialog | button → system dialog |
| iPhone (any browser) | Share → Add to Home Screen | 2-step guide, Share button at the bottom |
| iPad | Share → Add to Home Screen | 2-step guide, Share button top right |
| Mac — Safari 17+ | File → Add to Dock | 2-step guide |
| Android — Firefox | menu ⋮ → Install | 2-step guide |
| Windows / Mac — Firefox | cannot install | "open NeoSleep in Edge / Chrome" (Windows) or "Safari / Chrome" (Mac) + QR |
| Already installed (opened as app) | — | nothing |

## Acceptance criteria

1. After login, when the device can add the app, the card appears once; its title, benefits and button match the device (phone / tablet / Windows / Mac).
2. "Later" hides it; it appears once more after ≥ 7 days; after a second "Later" never again.
3. The avatar menu always offers the same action while the app is not installed.
4. On a computer the card shows a QR code that opens NeoSleep on a phone.
5. Nothing is offered inside the installed app, and the card/menu row disappear right after installing.
6. Copy exists in EN, PL, MX.
