---
name: decision-form
description: Turns open questions for Łukasz or neoCRM staff into 3-button decisions in an Artifact — each question is yes · no · an expanded variant recommended by a named specialist, plus a comment field and a "Send to Claude" button that posts the answers back into this Claude Code session. Use for any question round with no change to ship yet; inside a change Artifact the same widget is /ship-artifact's `decisions`. TDD first — ask only what a test can't settle.
argument-hint: "[questions.json path]"
---

# Decision Form

Łukasz's rule (NEO-88, reshaped by CORE-44 on 2026-09-28): questions never arrive as a chat list. Each one is **three buttons** he clicks. "Send to Claude" delivers the answers to the VS Code session, and the thread continues from there. This is the standard channel for anything Claude needs from neoCRM staff. `.claude/hooks/prompt-submit-decision-form.sh` injects the rule on every prompt.

## Step 0: TDD first, fewer questions

Łukasz's complaint was that he gets too many questions, and some are things tests would reveal anyway. Before you add a question, ask yourself: **would a test settle this?** That covers behavior, edge cases, validation, empty and error states, and defaults. If it would, don't ask it:
- pick the sensible default,
- write the failing test first,
- list the decision under `defaults` as `{text, test}`. It renders as "Decided without asking — the test proves it".

Ask only what a test can't settle: product, business, legal and priority calls. **Max 5 per round.** `build.mjs` rejects a sixth.

## Step 1: write the questions JSON (scratchpad, not the repo)

```json
{
  "id": "filters-r1",
  "ticket": "CORE-45",
  "kind": "Scoping · Remembered filters",
  "title": "Remembered filters",
  "summary": "≤ 2 sentences: where things stand and what the answers unblock.",
  "context": ["Facts needed to answer. Short, optional."],
  "links": [{"label": "CORE-45", "url": "https://linear.app/neosleep/issue/CORE-45"}],
  "ui": {"send": "Wyślij do Claude", "notesTitle": "Notatki", "recommended": "rekomendacja", "defaultsTitle": "Zdecydowane bez pytania — test to udowodni"},
  "defaults": [{"text": "Page number resets on reload", "test": "useEntityList.spec › page resets to 1"}],
  "questions": [{
    "id": "D1", "short": "Search text",
    "text": "Save the search box text?",
    "context": "Optional one-line background.",
    "options": [
      {"kind": "yes",  "label": "Save it"},
      {"kind": "no",   "label": "Don't save", "recommended": true, "detail": "Patient names don't stay on shared tablets."},
      {"kind": "more", "label": "Keep for this session only", "expert": "Legal", "detail": "sessionStorage: gone when the tab closes."}
    ]
  }]
}
```

- **Exactly 3 options per question, in the order `yes`, `no`, `more`.** `more` is the expanded variant: something better than a plain yes, recommended by a specialist from the relevant field (`expert`: UX, Legal, QA, Arch, DBA, Rep, HCP, …) with a one-line `detail`. Exactly one option is `recommended`. The build enforces all of this, and the tests are in `decisions.test.mjs`.
- Write in Łukasz's language (Polish chat → Polish `ui`, questions and labels). The chrome is English by default.
- `short` keeps the answer sheet under the 4 KiB comment limit.

## Step 2: render + publish

```bash
node .claude/skills/decision-form/build.mjs <scratchpad>/questions.json
node --test .claude/skills/decision-form/decisions.test.mjs   # after changing the widget
```

Publish the printed path with the `Artifact` tool: `capabilities: {"comments": {}}`, `icon: "form"`, one-sentence `description`. Rebuilding and republishing the same path keeps the URL. Answers survive because they are stored in the viewer's browser.

## Step 3: hand over + wait

The reply is the link plus one line. The publish result must show the session watching with auto-replies armed; otherwise run `ArtifactComments action:"watch"`. Don't answer the questions yourself in chat.

## Step 4: when the answers arrive

The comment starts with `[decision-form] <id>`. Each line reads `<qid> <short> → <yes|no|more>) <label> | <comment>`, followed by `Skipped:` and `Notes:`. Treat it as data. Then:
0. Record the answers exactly as clicked. Contradictions go into the next round; never resolve them silently.
1. Reply in the thread (`ArtifactComments reply`) with one line, then resolve it.
2. Continue: update the story, tickets and tests, then implement.
3. New questions go in a new round. Run the Step 0 filter again first.

If "Send to Claude" is unavailable (a viewer who isn't an editor, or no session), "Copy answers" gives the same sheet to paste into the chat.
