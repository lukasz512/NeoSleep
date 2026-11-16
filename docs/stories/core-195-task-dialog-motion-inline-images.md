# CORE-195 — Work item dialog: inline images, Done-when checklist, calm open/close for every dialog

Ticket: CORE-195 · Decisions: core195-r1 (2026-11-12), artifact https://claude.ai/artifact/PLRaDahdpujyZroZdN2VTq
Classification: Feature (internal tooling + app-wide dialog behaviour).

## User story
As a platform admin writing and reading work items, I paste a screenshot and see it where my cursor is, tick
"Done when" criteria as they are met, and every dialog in the app opens and closes without its content flashing,
so the board feels like one calm tool instead of a form that resets in front of me.

## Lenses
- User: Łukasz and agent sessions. Agents write markdown via `pnpm board`, so storage stays markdown.
- Client/tenant: the dialog fix is app-wide: reps, doctors and admins see the same calm open/close.
- Patient: none directly. Screenshots may contain patient data; they stay in the private bucket (CORE-192).
- Platform: one rule in AppFormDialog (reset after leave) plus a real-browser guard keeps new dialogs honest.
- Compliance: no new data. Inline images reuse the CORE-192 attachment store and its signed URLs.

## Decisions (Łukasz, core195-r1)
- D1: WYSIWYG editor (TipTap) that stores markdown. A pasted image is uploaded and inserted at the cursor as
  `![name](attachment:<id>)`; the editor shows it through a signed URL. The attachment strip keeps PDFs and
  images that are not referenced in the text.
- D2: Done when = `- [ ]` checklist with checkboxes in the dialog and an `n/N` counter on the board card.
  MX label typo fixed ("Listo cuando").
- D3: every dialog fixed, plus an e2e guard that fails when a dialog's content changes during its leave.

## Acceptance criteria → tests
- A dialog keeps its content until it has faded out; resets happen on `after-leave` → e2e/dialog-leave.spec.ts
- The work item opens with the board row's data, no loader; only history loads → WorkItemDialog.spec
- Attach opens the system file picker (Chromium, WebKit, Firefox) → e2e/work-item-dialog.spec.ts
- Pasting an image into the description inserts it at the cursor and saves `![..](attachment:id)` → WorkItemDialog.spec + e2e
- Markdown written by the CLI round-trips through the editor unchanged (headings, lists, checkboxes, links) → markdown spec
- Ticking a Done-when box flips `- [ ]` ↔ `- [x]` in the saved text; the card shows `1/2` → WorkItemDialog.spec, WorkBoardView.spec
- i18n parity for new keys → existing parity check
