// PR description for the "Create PR" compare URL (CORE-188). A `body=` parameter makes
// GitHub skip .github/PULL_REQUEST_TEMPLATE.md entirely, so the body itself carries the
// template's sections, filled from the ship content and the branch's changed files.
// hasEmptySummary() is the CI check for PRs opened any other way (e.g. GitHub's
// "Compare & pull request" banner, which leaves the template empty).

const TYPES = {
  bug: "Bug fix",
  feature: "New feature",
  refactor: "Refactor / cleanup (no behavior change)",
  docs: "Documentation",
  infra: "Infrastructure / CI/CD",
};

const MAX_AREAS = 12;

export function typeOfChange(kind, files) {
  const k = (kind ?? "").toLowerCase();
  if (/fix|bug/.test(k)) return TYPES.bug;
  if (/feat/.test(k)) return TYPES.feature;
  if (/refactor|cleanup|chore/.test(k)) return TYPES.refactor;
  if (/doc/.test(k)) return TYPES.docs;
  if (/infra|ci|harness|tooling/.test(k)) return TYPES.infra;
  if (files.length && files.every((f) => f.startsWith("docs/") || f.endsWith(".md"))) return TYPES.docs;
  if (files.length && files.every((f) => /^(\.github|\.claude|\.husky|infrastructure)\//.test(f))) return TYPES.infra;
  return TYPES.refactor;
}

// apps/<x>, packages/<x>, clients/<x>/<y> are areas; anything else groups by its top folder.
function areaOf(file) {
  const parts = file.split("/");
  if (parts.length === 1) return file;
  if (["apps", "packages"].includes(parts[0])) return parts.slice(0, 2).join("/");
  if (parts[0] === "clients") return parts.slice(0, 3).join("/");
  return parts[0];
}

function changes(files) {
  const counts = new Map();
  for (const f of files) counts.set(areaOf(f), (counts.get(areaOf(f)) ?? 0) + 1);
  const areas = [...counts.entries()];
  const lines = areas.slice(0, MAX_AREAS).map(([area, n]) => (area.includes(".") && n === 1 && !area.startsWith(".") ? `- \`${area}\`` : `- \`${area}\` — ${n} file${n === 1 ? "" : "s"}`));
  if (areas.length > MAX_AREAS) lines.push(`- …and ${areas.length - MAX_AREAS} more areas`);
  return lines.join("\n") || "- (no file changes)";
}

const migrationsOf = (files) => files.filter((f) => /\/migrations\/.*\.sql$/.test(f));
const touchesApp = (files) => files.some((f) => /^(apps\/(api|pwa)|packages|clients)\//.test(f));

function compliance(files) {
  if (!touchesApp(files)) return "- [x] No compliance-relevant impact";
  return [
    "- [ ] Touches personal or health data (GDPR Art. 6/9) — describe below",
    "- [ ] Adds/changes an `audit_log` write for a mutation",
    "- [ ] Crosses a tenant boundary — confirm `withTenant()` wraps every new query",
    "- [ ] No compliance-relevant impact",
  ].join("\n");
}

function rollback(files, explicit) {
  if (explicit) return explicit;
  const migrations = migrationsOf(files);
  if (migrations.length) return `Contains migration ${migrations.map((m) => `\`${m}\``).join(", ")} — a code revert does not undo it; additive-only, so reverting the code is safe.`;
  return "Safe to revert as-is.";
}

export function prBody({ ticket, summary, kind, files = [], verify = [], rollback: rollbackText, boardUrl, artifactUrl }) {
  const type = typeOfChange(kind, files);
  const related = [ticket, boardUrl && `[Board](${boardUrl})`, artifactUrl && `[Artifact](${artifactUrl})`].filter(Boolean).join(" · ");
  return [
    "## Summary",
    (summary ?? "").replace(/<[^>]+>/g, "").trim() || "_(fill in)_",
    "## Type of change",
    Object.values(TYPES).map((t) => `- [${t === type ? "x" : " "}] ${t}`).join("\n"),
    "## Changes",
    changes(files),
    "## Testing",
    verify.length ? verify.map((v) => `- [ ] ${v.replace(/<[^>]+>/g, "")}`).join("\n") : "- [ ] CI green",
    "## Compliance & data impact",
    compliance(files),
    "## Rollback",
    rollback(files, rollbackText),
    "## Related",
    related || "—",
    "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  ].join("\n\n");
}

/** True when the PR body has no real text under "## Summary" (missing heading, or only the template comment). */
export function hasEmptySummary(body) {
  const m = /^## Summary[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(body ?? "");
  if (!m) return true;
  return m[1].replace(/<!--[\s\S]*?-->/g, "").trim() === "";
}
