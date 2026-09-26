# NEO-103 — Login backdrop: delta-wave dots, asymmetric orbs, card "inhale"

## Story
As a user signing in, I want the background to react when I press "Sign in"
(the card takes the dots in), and to settle back calmly if the sign-in fails,
so that the screen clearly shows it is working without a spinner fighting for
attention.

## Decisions (Łukasz, 2026-09-26)
Chosen from two interactive design mocks:
- Variant B "Fale delta": https://claude.ai/artifact/4n4KWWqepnaQAea22W1G7i
- Loading choreography 2 "Wdech karty": https://claude.ai/artifact/BqXJB3CUGx1tjDEMuvXKdo

| Item | Value |
|---|---|
| Dot grid spacing | 40 px |
| Dot radius rest → pointer peak | 1.8 → 4.5 px |
| Ambient motion | vertical delta wave, ±3.5 px + ±2 px, 9 s / 13 s, crest brighter |
| Orbs | big off bottom-right (0.8 vmax), medium under logo (0.336 vmax), small at the card's lower-left corner (0.16 vmax); elliptical drift 40 / 55 / 33 s; thin white ring |
| Inhale (busy) | 1.5 s, nearest dots first, pulled up to 90 px toward the card, glow + shrink |
| Exhale (error) | 1.5 s, slight overshoot past home |
| Success | dots stay inhaled through the existing exit sequence |

## Acceptance criteria
- Wrong password: dots inhale, then exhale back once the error shows.
- An error arriving mid-inhale reverses from each dot's current state (no jump).
- Correct password: the dots stay inhaled, then the existing orb exit plays.
- Reduced motion: static grid, no inhale, no drift.
- Boot splash paints the orbs where the Vue orbs start (no jump at takeover).
- Pointer repulsion unchanged (desktop only, as before).

## Out of scope
- Change-password and other public views: the dots only react to AuthView's own requests.
