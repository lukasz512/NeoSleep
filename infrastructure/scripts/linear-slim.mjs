// Slims one Linear issue (export.json shape) into a platform.work_item row plus the
// comments worth keeping (CORE-177, docs/stories/platform-work-board.md, decision K3):
// keep title, Problem / Change / Done when, status, priority, PR/artifact links,
// decisions and Łukasz's own words; drop the agent's progress chatter.

const MAX_SECTION = 1500;
const MAX_COMMENT_LINES = 5;
const MAX_COMMENT_CHARS = 600;

export const STATUS_MAP = {
  Triage: "triage",
  Backlog: "backlog",
  Todo: "backlog",
  "Ready for Worker": "to_spec",
  "In Progress": "building",
  Blocked: "backlog",
  "Needs Review": "needs_review",
  Done: "done",
  Canceled: "canceled",
  Duplicate: "canceled",
};

export const PRIORITY_MAP = { Urgent: 1, High: 2, Medium: 3, Low: 4, "No priority": 0 };

/** Labels that only described the old pipeline's state. */
const DROPPED_LABELS = new Set(["ci-failed", "backend-approved"]);

/** Comment openings that are the agent reporting progress, not information. */
const NOISE = [
  /^work started/i,
  /^implemented\b/i,
  /^built and pushed\b/i,
  /^implementation (done|pushed|complete)/i,
  /^pushed\b/i,
  /^branch[: ]/i,
  /^environment pre-flight/i,
  /^\*\*worker run/i,
  /^\*\*blocked — environment/i,
  /^<!-- ci-autofix -->/i,
  /^artifact: https:\/\/\S+\s*$/i,
  /^\d{4}-\d{2}-\d{2} linear clea/i,
  /^closed in \d{4}-\d{2}-\d{2} linear/i,
  /^deferred — requires a /i,
];

/** Decisions are always kept, whatever their length. */
const DECISION = /^(\*\*)?(\[decision-form\]|decisions?\b|decided\b)|\(Łukasz[,)]/i;

const POLISH_WORDS = new Set([
  "nie", "jest", "sie", "się", "zeby", "żeby", "chce", "chcę", "chcialbym", "chciałbym", "potrzebuje", "potrzebuję",
  "sprobuj", "spróbuj", "zrob", "zrób", "mamy", "moze", "może", "tez", "też", "juz", "już", "jak", "prosze",
  "proszę", "dlaczego", "jeszcze", "raz", "tak", "ale", "czy", "tutaj", "tu", "to", "co", "ja", "mi",
]);

/** Łukasz writes comments in Polish; the agent writes English. Two Polish function words decide it. */
export function isHumanComment(body) {
  const words = body.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  return words.filter((w) => POLISH_WORDS.has(w)).length >= 2;
}

export function isNoise(body) {
  const text = body.trim();
  return NOISE.some((re) => re.test(text));
}

function clip(text, max) {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** First MAX_COMMENT_LINES non-empty lines, at most MAX_COMMENT_CHARS. */
export function shortComment(body) {
  const lines = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  const kept = lines.slice(0, MAX_COMMENT_LINES).join("\n");
  return clip(lines.length > MAX_COMMENT_LINES ? `${kept}\n…` : kept, MAX_COMMENT_CHARS);
}

/** Splits a "## Problem / ## Change / ## Done when" body; anything else becomes the problem. */
export function splitSections(description) {
  const text = (description ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
  const out = { problem: null, change: null, done_when: null };
  if (!text) return out;
  const re = /^#{1,3}\s*(problem|change|done when)\s*$/gim;
  const marks = [...text.matchAll(re)];
  if (!marks.length) {
    out.problem = clip(text, MAX_SECTION);
    return out;
  }
  const preamble = text.slice(0, marks[0].index).trim();
  marks.forEach((m, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(m.index + m[0].length, end).trim();
    const key = m[1].toLowerCase() === "done when" ? "done_when" : m[1].toLowerCase();
    if (body) out[key] = clip(body, MAX_SECTION);
  });
  if (preamble && !out.problem) out.problem = clip(preamble, MAX_SECTION);
  return out;
}

function linkKind(url, title) {
  if (/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)) return "pr";
  if (/github\.com\/[^/]+\/[^/]+\/actions\/runs\//.test(url)) return "ci";
  if (/claude\.ai\/(code\/)?artifact\//.test(url)) return /spec|story|decision|form/i.test(title ?? "") ? "spec" : "artifact";
  return "other";
}

export function slimLinks(attachments) {
  const seen = new Set();
  const links = [];
  for (const a of attachments ?? []) {
    if (!a?.url || !a.url.startsWith("https://") || seen.has(a.url)) continue;
    seen.add(a.url);
    const link = { kind: linkKind(a.url, a.title), url: a.url };
    if (a.title) link.title = clip(a.title, 200);
    links.push(link);
  }
  return links.slice(0, 20);
}

export function slimComments(comments) {
  return (comments ?? [])
    .filter((c) => c?.body?.trim() && !isNoise(c.body))
    .filter((c) => DECISION.test(c.body.trim()) || isHumanComment(c.body) || /^✅?\s*verified on pwa-dev/i.test(c.body.trim()))
    .map((c) => ({ body: shortComment(c.body), created_at: c.createdAt }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** One export.json issue → { item, comments }, or null when its key is not KEY-n. */
export function slimIssue(issue) {
  const match = /^([A-Z][A-Z0-9]{1,9})-(\d+)$/.exec(issue.identifier ?? "");
  if (!match) return null;
  const state = issue.state?.name ?? "Backlog";
  const labels = (issue.labels?.nodes ?? []).map((l) => l.name).filter((n) => !DROPPED_LABELS.has(n));
  if (state === "Blocked") labels.push("blocked");
  if (state === "Duplicate") labels.push("duplicate");
  const status = STATUS_MAP[state] ?? "backlog";
  return {
    item: {
      team_key: match[1],
      number: Number(match[2]),
      title: clip(issue.title ?? match[0], 200),
      ...splitSections(issue.description),
      status,
      priority: PRIORITY_MAP[issue.priorityLabel] ?? 0,
      labels: [...new Set(labels)].slice(0, 10),
      links: slimLinks(issue.attachments?.nodes),
      branch: null,
      linear_identifier: issue.identifier,
      created_at: issue.createdAt,
      completed_at: status === "done" || status === "canceled" ? (issue.completedAt ?? issue.canceledAt ?? issue.updatedAt) : null,
    },
    comments: slimComments(issue.comments?.nodes),
  };
}
