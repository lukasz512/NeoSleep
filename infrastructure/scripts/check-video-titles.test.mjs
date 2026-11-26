import { test } from "node:test";
import assert from "node:assert/strict";
import { titlesOf, punctuatedTitles } from "./check-video-titles.mjs";

const page = (copy) => `<script>\n  const COPY = ${copy};\n  const x = 1;\n</script>`;

test("a title ending with a period is rejected", () => {
  const bad = punctuatedTitles(titlesOf(page(`{\n    en: { tag: "Designed with sleep specialists." },\n  }`)));
  assert.deepEqual(bad.map((b) => b.path), ["en.tag"]);
});

test("commas, question and exclamation marks are rejected, also inside arrays", () => {
  const bad = punctuatedTitles({ en: { hook: "More energy, every day", patients: ["Patients", "Ready?"], x: "¡Hola!" } });
  assert.deepEqual(bad.map((b) => b.path), ["en.hook", "en.patients[1]", "en.x"]);
});

test("line breaks, emphasis and apostrophes are fine", () => {
  assert.deepEqual(punctuatedTitles({ en: { hook: "More energy<br><em>every day</em>", p: "Every patient's path" } }), []);
});

test("a titles JSON file is checked too", () => {
  assert.deepEqual(punctuatedTitles(titlesOf('{"mx":{"step":"Abre el paciente."}}', "titles.json")).map((b) => b.path), ["mx.step"]);
});

test("a page without COPY has nothing to check", () => {
  assert.equal(titlesOf("<p>no copy</p>"), null);
});
