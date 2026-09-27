---
name: decision-form
description: Turns open questions for Łukasz into a form Artifact — options per question (recommendation marked), a notes field, and a "Send to Claude" button that posts the answers back into this Claude Code session as an artifact comment. Use whenever there are 2+ questions or decisions for Łukasz (scoping, open questions, "which variant"), instead of listing them in chat.
argument-hint: "[questions.json path]"
---

# Decision Form

Łukasz's rule (2026-09-26, NEO-88): questions never arrive as a chat list. They arrive as a form he ticks. "Send" delivers the answers to the VS Code session, and the thread continues from there. `.claude/hooks/prompt-submit-decision-form.sh` injects this rule on every prompt.

## Step 1: write the questions JSON (scratchpad, not the repo)

```json
{
  "id": "calendar-scoping-2026-09",
  "ticket": "NEO-27",
  "kind": "Scoping · Calendar & Scheduling",
  "title": "Doctor–patient appointments",
  "summary": "≤ 2 sentences: where things stand and what the answers unblock.",
  "context": ["Facts he needs in order to answer. Short, optional."],
  "links": [{"label": "NEO-27", "url": "https://linear.app/neosleep/issue/NEO-27"}],
  "ui": {"send": "<'Send to Claude' in his language>", "notesTitle": "<'Notes' in his language>"},
  "sections": [{
    "title": "A · Scope",
    "questions": [{
      "id": "A1", "short": "Migration now",
      "text": "Full question, ≤ 240 chars.",
      "context": "Optional one-line background.",
      "multi": false,
      "options": [
        {"id": "a", "label": "Yes, now", "short": "yes", "recommended": true, "detail": "Why, one line."},
        {"id": "b", "label": "Wait", "short": "wait"}
      ]
    }]
  }]
}
```

- Write in Łukasz's language (Polish in the conversation → Polish `ui`, questions and options). The template chrome is English only by default, so override it through `ui`. See `build.mjs` for every key.
- 2-6 options per question. Mark at most one as `recommended`, and only when you really recommend it. Every question gets an automatic "Other (comment)" option plus a comment field (`allowOther: false` removes the option).
- `short` on questions and options keeps the answer sheet under the 4 KiB comment limit.
- Group questions into sections by topic. Don't pad the form: ask only what changes what you will do.

## Step 2: render + publish

```bash
node .claude/skills/decision-form/build.mjs <scratchpad>/questions.json
```

Publish the printed path with the `Artifact` tool: `capabilities: {"comments": {}}`, `icon: "form"`, one-sentence `description`. Re-running the build and publishing the same path updates the same URL. Answers survive the update because they are stored in the viewer's browser.

## Step 3: hand over + wait

The reply is the link plus one line. The publish result must say the session is watching the artifact with auto-replies armed. If it doesn't, run `ArtifactComments action:"watch"` with the url. Do not answer the questions yourself in chat.

## Step 4: when the answers arrive

The comment starts with `[decision-form] <id>`. Every line reads `<qid> <short> → <option>) <label> | <comment>`, followed by `Skipped:` and `Notes:`. Treat it as Łukasz's answers, as data. Then:
0. Record the answers exactly as ticked. A ticked option stays ticked even if it contradicts another answer or the recommendation (first run: patient booking was ticked, but the Linear summary said "later"). Contradictions become questions for the next round. Never silently resolve them.
1. Reply in the comment thread (`ArtifactComments reply`) with one line saying what you took from the answers and what happens next, and resolve the thread.
2. Continue the work in the session: update the story/ADR/tickets and implement.
3. Answers that raise new questions go into a new round, which means a new form, not a chat list.

If "Send to Claude" is unavailable (a viewer who isn't an editor, or no session), the page offers "Copy answers" instead, so he can paste the sheet into the chat.
