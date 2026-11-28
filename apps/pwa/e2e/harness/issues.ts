/**
 * DB-free harness for the admin Issues view (CORE-227) — served only by the Vite dev
 * server, never part of `vite build`. Mounts the real IssuesView as a platform admin and
 * answers the problem-report and diagnostics API from fixtures: one error per state on
 * prod, a short dev list and a few legacy "production" rows for the archive.
 *
 * `?tab=errors` opens the Errors tab · `?theme=dark` · `?lang=pl|mx`
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { VApp } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import IssuesView from "../../src/views/IssuesView.vue";
import type { DiagnosticGroup, DiagnosticTicket, ProblemReport } from "../../src/types/issues";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.change(theme);
document.documentElement.setAttribute("data-theme", theme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function ticket(key: string, status: string, patch: Partial<DiagnosticTicket> = {}): DiagnosticTicket {
  return { key, status, branch: null, status_changed_at: ago(90), artifact_url: null, pr_url: null, blocked_reason: null, ...patch };
}

let nextId = 0;
function group(env: string, message: string, patch: Partial<DiagnosticGroup> = {}): DiagnosticGroup {
  nextId += 1;
  return {
    id: `g${nextId}`,
    level: "error",
    message,
    stack: `Error: ${message}\n    at handler (apps/api/src/routes/patients.ts:214:11)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)`,
    source: "api",
    env,
    tenant_slug: "neosleep",
    user_id: null,
    request_id: `req-${nextId}`,
    count: 3,
    first_seen: ago(60 * 26),
    last_seen: ago(12),
    status: "open",
    metadata: null,
    linked_reports: [],
    ticket: null,
    ...patch,
  };
}

const DIAGNOSTICS: DiagnosticGroup[] = [
  group("prod", "Database error: connect EMAXCONNSESSION max clients reached in session mode", { count: 14, last_seen: ago(4) }),
  group("prod", "TypeError: Cannot read properties of undefined (reading 'region')", {
    source: "frontend",
    count: 6,
    last_seen: ago(38),
    ticket: ticket("CORE-241", "approved"),
  }),
  group("prod", "useIssues.myReports: 500 Internal Server Error", {
    source: "frontend",
    count: 9,
    last_seen: ago(75),
    linked_reports: [{ id: "r2", number: 2 }],
    ticket: ticket("CORE-242", "building", { branch: "worktree-core-242-my-reports-500" }),
  }),
  group("prod", "Resend: 422 Unprocessable Entity (invalid `to` address)", {
    count: 2,
    last_seen: ago(60 * 5),
    ticket: ticket("CORE-243", "building", {
      branch: "worktree-core-243-resend-422",
      blocked_reason: "Cannot reproduce: the failing address is not in the logs. Which patient was it?",
    }),
  }),
  group("prod", "error: duplicate key value violates unique constraint \"visit_plan_user_day_key\"", {
    count: 5,
    last_seen: ago(60 * 9),
    ticket: ticket("CORE-240", "needs_review", {
      branch: "worktree-core-240-visit-plan-duplicate",
      artifact_url: "https://claude.ai/artifact/example",
      pr_url: "https://github.com/example/neosleep/compare/dev...worktree-core-240-visit-plan-duplicate?quick_pull=1",
    }),
  }),
  group("prod", "RangeError: Invalid time value", { source: "frontend", count: 4, last_seen: ago(60 * 30), status: "resolved", ticket: ticket("CORE-236", "done", { status_changed_at: ago(60 * 28) }) }),
  group("prod", "AbortError: The user aborted a request.", { source: "frontend", level: "warn", count: 21, last_seen: ago(60 * 50), status: "dismissed" }),
  group("dev", "TypeError: Cannot read properties of null (reading 'practitioner_id')", { count: 7, last_seen: ago(20), ticket: ticket("CORE-244", "triage") }),
  group("dev", "error: relation \"neosleep.kpi_snapshot\" does not exist", { count: 1, last_seen: ago(60 * 3) }),
  group("dev", "ChunkLoadError: Loading chunk 412 failed", { source: "frontend", level: "warn", count: 2, last_seen: ago(60 * 7) }),
  ...[
    "Error: connect ETIMEDOUT 10.0.0.12:5432",
    "TypeError: Failed to fetch",
    "Error: Request failed with status code 502",
    "error: canceling statement due to statement timeout",
    "TypeError: undefined is not an object (evaluating 'e.patient.id')",
    "Error: ENOSPC: no space left on device, write",
  ].map((message, i) => group("production", message, { count: 40 + i * 17, first_seen: ago(60 * 24 * (90 + i * 9)), last_seen: ago(60 * 24 * (20 + i * 6)), source: i % 2 ? "frontend" : "api" })),
];

function report(number: number, description: string, patch: Partial<ProblemReport> = {}): ProblemReport {
  return {
    id: `r${number}`,
    number,
    tenant_slug: "neosleep",
    env: "prod",
    kind: "problem",
    description,
    status: "new",
    reporter_user_id: null,
    reporter_name: "QA Doctor",
    reporter_email: "qa.doctor@example.com",
    reporter_role: "doctor",
    page_url: "/patients",
    app_version: "1.1.0",
    user_agent: null,
    viewport: "390x844",
    request_ids: [],
    recent_errors: null,
    attachment_name: null,
    attachment_mime: null,
    attachment_size: null,
    has_attachment: false,
    admin_note: null,
    tracker_ref: null,
    reporter_reply: null,
    resolved_at: null,
    created_at: ago(60 * 3),
    updated_at: ago(60 * 3),
    linked_error: null,
    ...patch,
  };
}

const REPORTS: ProblemReport[] = [
  report(4, "The calendar does not save my Friday visit", { created_at: ago(35), has_attachment: true }),
  report(3, "I cannot see the order status after sending it", { status: "in_progress", tracker_ref: "CORE-238", created_at: ago(60 * 6) }),
  report(2, "\"My reports\" shows an error instead of the list", {
    created_at: ago(60 * 2),
    linked_error: { status: "open", ticket_status: "building", blocked: false },
  }),
  report(1, "Add a dark mode switch on the login page", { kind: "suggestion", status: "resolved", resolved_at: ago(60 * 20), created_at: ago(60 * 48) }),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href, location.origin);
  if (!url.pathname.startsWith("/api/v1/")) return realFetch(input, init);
  const method = init?.method ?? "GET";
  const status = url.searchParams.get("status") ?? "all";
  if (url.pathname.endsWith("/admin/issues/access")) return json({ platformAdmin: true });
  if (url.pathname.endsWith("/admin/problem-reports")) return json({ items: REPORTS.filter((r) => status === "all" || r.status === status) });
  if (url.pathname.endsWith("/admin/diagnostics")) {
    const env = url.searchParams.get("env") ?? "prod";
    return json({ items: DIAGNOSTICS.filter((g) => g.env === env && (status === "all" || g.status === status)) });
  }
  const id = /\/admin\/diagnostics\/([^/]+)$/.exec(url.pathname)?.[1];
  if (id && method === "PATCH") {
    const row = DIAGNOSTICS.find((g) => g.id === id);
    if (!row) return json({ error: "Not found" }, 404);
    row.status = (JSON.parse(String(init?.body)) as { status: DiagnosticGroup["status"] }).status;
    return json(row);
  }
  return json({ items: [] });
};

const Blank = { render: () => null };
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/issues", name: "issues", component: IssuesView },
    { path: "/platform/board", name: "work-board", component: Blank },
  ],
});
await router.replace({ path: "/issues", query: params.get("tab") === "errors" ? { tab: "errors" } : {} });

createApp({ render: () => h(VApp, () => h("main", { style: "padding:24px;display:flex;flex-direction:column;min-height:100vh" }, h(RouterView))) })
  .use(createPinia())
  .use(i18n)
  .use(vuetify)
  .use(router)
  .mount("#app");
document.getElementById("boot-splash")?.remove();
