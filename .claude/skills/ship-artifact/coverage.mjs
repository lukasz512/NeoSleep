// Story coverage on the Artifact (CORE-182): the ticket's acceptance criteria and the
// tests tagged "@<TICKET> ACn" that prove them, computed — not self-reported. A gap stops
// the handover (render and light refuse), so a ticket can't reach Needs Review untested.
// English only (CLAUDE.md).

import { coverage, needs } from "../../../infrastructure/scripts/story-coverage.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Coverage of `ticket` plus what this change still misses, given the files it changed. */
export function storyGate(root, ticket, changedFiles) {
  const c = coverage(root, ticket);
  return { c, problems: c.problems(needs(changedFiles)) };
}

/** The marker's testCoverageMap, filled from the tags instead of written by hand. */
export function coverageMap(c) {
  return c.criteria.map((a) => ({ ac: `${a.id} ${a.text}`.slice(0, 160), tests: a.tests.map((t) => `${t.file}:${t.line}`) }));
}

export function coverageHtml(c) {
  if (!c.story) return "";
  const rows = c.criteria
    .map((a) => {
      const tests = a.tests.length
        ? a.tests.map((t) => `<code>${esc(t.file)}:${t.line}</code>${t.realBackend ? ' <span class="pill allow">e2e</span>' : ""}`).join("<br>")
        : '<span class="pill hole">no test</span>';
      return `<tr><td>${a.id}</td><td>${esc(a.text)}</td><td>${tests}</td></tr>`;
    })
    .join("");
  const covered = c.criteria.length - c.uncovered.length;
  return `<h3>Acceptance criteria → tests (${covered}/${c.criteria.length})</h3><p class="muted">From <code>${esc(c.story)}</code> and the tests tagged <code>@${esc(c.ticket)} ACn</code>.</p><div class="matrix"><table><thead><tr><th>AC</th><th>Criterion</th><th>Tests</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
