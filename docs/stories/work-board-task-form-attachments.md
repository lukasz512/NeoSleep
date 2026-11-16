## Refined User Story: Work board task form with image paste and attachments (CORE-192)

**Classification**: feature (new capability, schema change, and it will become client-facing)
**Raw input**: "In tasks on the PWA, the new task view: I want to improve it. I can't paste images, and that's the most important thing. The form should look more like Jira or monday.com. Remember it will also be visible to the client at some point and they will communicate with us there."

Decisions already taken (decision form `task-form-redesign-r1`, 2026-11-10):
- D1: variant A, a Linear-style single column (not the recommended two-column Jira layout)
- D2: comments are internal by default; making one visible to the client is an explicit choice (follow-up ticket)
- D3: clients get a simplified "Report a problem" form that lands in Triage (follow-up ticket)

### As a platform team member, I want to paste or drop screenshots into a work item and see the item as a clean one-column form so that a bug is described in seconds and the same item can later be discussed with the client

### Stakeholder Notes
- 👤 User: today the platform team (Łukasz, Claude sessions) describes visual bugs in words or pastes them elsewhere. Screenshots are the fastest bug description; on a phone, camera or gallery matters more than paste.
- 🏢 Client: no client access yet. This slice prepares for it: attachments are private, and nothing in this slice exposes data to a client.
- 🩺 Patient: indirect only. Screenshots of the PWA can contain patient names or health data (PHI), so attachments must never be public.
- 🚀 NeoCRM/Platform: the board is platform-wide (CORE / NEO / AJM teams), so this serves every future tenant. Reuse the existing private Supabase bucket + signed-URL pattern (`services/partnerDocuments.ts`, `routes/problemReport.ts`) instead of a new storage path.
- ⚖️ Compliance: a screenshot with PHI is personal health data under GDPR/LFPDPPP. Flags: private bucket, short-lived signed URLs, authorised users only, deleting an attachment really deletes the object. Before clients get access (D2/D3), run `/perspective legal` on cross-tenant visibility.

### Medical-Industry Trend Check
- n/a: internal tooling change

### Acceptance Criteria
- [ ] Pasting an image (Cmd/Ctrl+V) into the description or comment box uploads it and shows a thumbnail (`WorkItemDialog.spec`)
- [ ] Dropping a file on the dialog uploads it; a file picker is available, which on phones offers the camera (`WorkItemDialog.spec`)
- [ ] Only image/* and application/pdf up to 10 MB are accepted; other files get a clear message and no request is sent (`useWorkAttachments.spec`); the API rejects them too with 400 (integration test)
- [ ] Attachments live in the private bucket; `GET …/attachments/:id` returns a signed URL valid for a short time; without a platform session it is 401/403 (integration test, real DB)
- [ ] Deleting an attachment removes the row and the stored object, and adds an event to the item history
- [ ] In a new item, attachments pasted before Create are uploaded right after the item is created
- [ ] The dialog shows a large inline title, a chip row (status, priority, team, assignee, due date), one description, and Problem / Change / Done when as sections added with one click; a "Development" chip shows when the item has PR/Artifact links
- [ ] Assignee and due date are stored on the item (new migration) and appear in its history
- [ ] At 390 px the dialog is full screen

### Open Questions
- none (D1–D3 answered; storage reuses the existing private bucket)

### Hand-off
→ `/arch assess` light pass inside the plan: one new migration (`work_item_attachment` + `assignee`, `due_date` on `work_item`)
→ `/dev feat work-board-attachments`
