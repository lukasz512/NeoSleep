# NEO-56: Breadcrumbs next to the back arrow on detail views

**Linear:** NEO-56
**Decided by:** Łukasz, 2026-09-25. He chose placement from three options, compared on real screenshots of `origin/dev`: https://claude.ai/artifact/7dqKz9MZdES7gSTiFyRE8v

## Story
As a field user on a record's detail page, I want to see which list I came from and how the page fits the app. I also want to jump back to that list in one tap, instead of guessing where the bare ← arrow leads.

## Decision
- **Placement:** in the card's existing header row, right after the ← back arrow. The row already holds the arrow and the action icons, so the breadcrumbs cost no vertical space.
- **Options rejected:**
  - **Breadcrumbs in the grey app-bar title:** at phone width the name truncates to "Pacjenci › J.", and NEO-55 moves that title into the card anyway.
  - **A separate strip above the card:** it costs 36px on every screen, and the empty arrow row would still be there.
- **Hierarchy, not history.** The parent is always the back route. A patient → their doctor link shows "Doctors › dr X", not the click path.

## Behaviour
| Route | Desktop | ≤600px |
|---|---|---|
| `/patients/:id`, `/hcp/:id`, `/hco/:id`, `/users/:id` | ← Module › Record name | ← Module |
| `/leads/:id` | ← Leads › [avatar] Name (the name is the existing inline header title) | ← Leads › [avatar] Name |
| `/documents/:templateKey/:locale` | ← Documents › Template › Locale | ← Documents |
| List pages | unchanged | unchanged |

## Implementation
`ItemDetailLayout.vue` takes a new `trail?: string[]` prop.
- **Parent crumb:** derived from `backRoute`'s route name via `navTitleKey`, the same label as the sidebar item.
- **Markup:** `<nav aria-label>` + `<ol>`. The last crumb has `aria-current="page"` and is not a link. The parent link keeps a 44px touch target.
- **When hidden:** not rendered while loading, on not-found/error, or when `backRoute` is a plain path.

The new i18n key is `app.common.breadcrumbs`, in en/pl/mx.

## Out of scope / follow-ups
- NEO-55 (shell relayout, unmerged) reworks the same header row. Expect a merge conflict when both land; the two designs are compatible.
- There is no cross-entity history trail. The browser/OS back button covers history.
