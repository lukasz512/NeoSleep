// node --test infrastructure/scripts/dev-db/dev-storage.test.mjs (CORE-189)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { assertDevProject, placeholderFor, placeholderPdf } from "./dev-storage.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "dev-storage.mjs");

test("placeholder PDF is a well-formed PDF whose xref offsets point at its objects", () => {
  const pdf = placeholderPdf().toString("latin1");
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  const startxref = Number(pdf.match(/startxref\n(\d+)/)[1]);
  assert.equal(pdf.slice(startxref, startxref + 4), "xref");
  const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((offset, i) => assert.ok(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)));
});

test("placeholders keep the file kind", () => {
  assert.equal(placeholderFor("a/b/report.PDF").contentType, "application/pdf");
  assert.equal(placeholderFor("photo.jpg").contentType, "image/png");
  assert.equal(placeholderFor("export.csv").contentType, "text/plain");
});

test("refuses any project other than the named dev project", () => {
  assert.doesNotThrow(() => assertDevProject("https://devref.supabase.co", "devref"));
  assert.throws(() => assertDevProject("https://prodref.supabase.co", "devref"), /refusing/);
  assert.throws(() => assertDevProject("https://devref.supabase.co", ""), /DEV_SUPABASE_REF/);
  assert.throws(() => assertDevProject(undefined, "devref"), /refusing/);
});

test("scrub-dir replaces every file so no original byte survives", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dev-storage-"));
  try {
    const files = {
      "partner-documents/sleep-study/x/REPORT.pdf": "%PDF-1.7 Patient: Gertrudis Zwolinskaya",
      "qa-bucket/photos/face.jpg": "JFIF Gertrudis",
      "other/notes.txt": "Gertrudis +525512349876",
    };
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), content);
    }
    execFileSync("node", [SCRIPT, "scrub-dir", dir]);
    for (const path of Object.keys(files)) {
      const after = await readFile(join(dir, path), "latin1");
      assert.ok(!after.includes("Gertrudis"), `${path} still holds original content`);
    }
    assert.ok((await readFile(join(dir, "partner-documents/sleep-study/x/REPORT.pdf"), "latin1")).startsWith("%PDF"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
