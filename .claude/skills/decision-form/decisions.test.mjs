// node --test .claude/skills/decision-form/decisions.test.mjs
// The 3-button decision contract (CORE-44): every question is yes · no · expanded
// variant with a specialist's recommendation, max 5 per round.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateQuestions, answerSheet, widget, MAX_QUESTIONS } from "./decisions.mjs";

const q = (over = {}) => ({
  id: "D1",
  short: "Search text",
  text: "Save the search box text?",
  options: [
    { kind: "yes", label: "Save it" },
    { kind: "no", label: "Don't save", recommended: true },
    { kind: "more", label: "Save for 1 h only", expert: "Legal", detail: "Health data on disk expires quickly." },
  ],
  ...over,
});

test("a valid question passes", () => {
  assert.deepEqual(validateQuestions([q()]), []);
});

test("exactly 3 options: yes, no, more — in that order", () => {
  const two = q({ options: q().options.slice(0, 2) });
  assert.match(validateQuestions([two]).join(), /exactly 3 options/);
  const swapped = q({ options: [q().options[1], q().options[0], q().options[2]] });
  assert.match(validateQuestions([swapped]).join(), /yes, no, more/);
});

test("the expanded option names the specialist and explains itself", () => {
  const opts = q().options.map((o) => (o.kind === "more" ? { kind: "more", label: "x" } : o));
  const errs = validateQuestions([q({ options: opts })]).join();
  assert.match(errs, /expert/);
  assert.match(errs, /detail/);
});

test("exactly one recommended option", () => {
  const none = q({ options: q().options.map(({ recommended, ...o }) => o) });
  assert.match(validateQuestions([none]).join(), /exactly one recommended/);
  const two = q({ options: q().options.map((o) => ({ ...o, recommended: true })) });
  assert.match(validateQuestions([two]).join(), /exactly one recommended/);
});

test(`at most ${MAX_QUESTIONS} questions per round`, () => {
  const many = Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => q({ id: `D${i + 1}` }));
  assert.match(validateQuestions(many).join(), /max 5 questions/);
  assert.deepEqual(validateQuestions(many.slice(0, MAX_QUESTIONS)), []);
});

test("plain strings are rejected with a pointer to notes", () => {
  assert.match(validateQuestions(["Should we?"]).join(), /notes/);
});

test("answer sheet: picked kind + label + comment, skipped listed", () => {
  const data = { id: "filters", ticket: "CORE-45", title: "Filters", questions: [q(), q({ id: "D2", short: "URL" })] };
  const sheet = answerSheet(data, { answers: { D1: "more" }, notes: { D1: "  only  on tablets " }, final: "" });
  assert.equal(
    sheet,
    ["[decision-form] filters (CORE-45): Filters", "D1 Search text → more) Save for 1 h only | only on tablets", "Skipped: D2"].join("\n")
  );
});

test("widget renders 3 buttons per question and the send bar", () => {
  const w = widget({ id: "filters", title: "Filters", questions: [q(), q({ id: "D2" })] });
  assert.equal((w.html.match(/data-kind=/g) ?? []).length, 0, "buttons are built by the script, html is the mount");
  assert.match(w.html, /id="dw-filters"/);
  assert.match(w.script, /sendToClaude/);
  assert.match(w.script, /"kind":"more"/);
  assert.match(w.css, /\.dw-opts/);
});
