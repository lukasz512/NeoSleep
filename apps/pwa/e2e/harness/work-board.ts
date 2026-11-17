/**
 * DB-free harness for the platform work board (CORE-219, CORE-221) — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real WorkBoardView and answers the
 * work board API from fixtures, so the board can be looked at (and screenshot) in a real
 * browser without an API or a database: labels and sessions, two statuses with no tickets,
 * git markers of every kind in Building and Needs Review, one ticket on hold, two canceled.
 * Every ticket opens with the same three-line history.
 *
 * The board's own query works here too: `?sort=label` · `?labels=api` · `?sessions=1` · `?team=NEO`
 * Harness switches: `?theme=dark` · `?lang=pl|mx`
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import { VApp } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import WorkBoardView from "../../src/views/WorkBoardView.vue";
import type { WorkItem, WorkItemEvent, WorkLabel, WorkLink, WorkSessionToken, WorkStatus, WorkTeam } from "../../src/types/workBoard";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.global.name.value = theme;
document.documentElement.setAttribute("data-theme", theme === darkTheme ? "dark" : "light");
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") i18n.global.locale.value = lang;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

const TEAMS: WorkTeam[] = [
  { key: "CORE", name: "Platform", kind: "platform" },
  { key: "NEO", name: "NeoSleep", kind: "client" },
];

const LABELS: WorkLabel[] = [
  { id: "l1", name: "api", color: "blue", created_at: ago(30 * DAY) },
  { id: "l2", name: "billing", color: "amber", created_at: ago(30 * DAY) },
  { id: "l3", name: "ci", color: "purple", created_at: ago(30 * DAY) },
  { id: "l4", name: "frontend", color: "green", created_at: ago(30 * DAY) },
  { id: "l5", name: "security", color: "red", created_at: ago(30 * DAY) },
  { id: "l6", name: "hold", color: "teal", created_at: ago(30 * DAY) },
];

const TOKENS: WorkSessionToken[] = [
  { id: "t1", name: "MacBook Pro", created_by: "qa@example.com", created_at: ago(20 * DAY), last_used_at: ago(4 * MINUTE), revoked_at: null },
  { id: "t2", name: "Nightly worker", created_by: "qa@example.com", created_at: ago(12 * DAY), last_used_at: ago(9 * 60 * MINUTE), revoked_at: null },
  { id: "t3", name: "Old laptop", created_by: "qa@example.com", created_at: ago(60 * DAY), last_used_at: ago(40 * DAY), revoked_at: ago(30 * DAY) },
];

const pr = (n: number): WorkLink => ({ kind: "pr", url: `https://github.com/example/repo/pull/${n}` });
const ci = (state?: "passed" | "failed"): WorkLink => ({ kind: "ci", url: "https://github.com/example/repo/actions/runs/1", ...(state ? { state } : {}) });
const spec: WorkLink = { kind: "spec", url: "https://claude.ai/artifact/example" };

const checked = { git_checked_at: ago(60 * MINUTE) };
const onDev = (sha: string) => ({ git_state: "dev" as const, git_sha: sha, ...checked });
const onProd = (sha: string) => ({ git_state: "prod" as const, git_sha: sha, ...checked });

let seq = 0;
function item(key: string, title: string, status: WorkStatus, overrides: Partial<WorkItem> = {}): WorkItem {
  const [team, number] = key.split("-") as [string, string];
  return {
    id: `item-${++seq}`,
    key,
    team_key: team,
    number: Number(number),
    title,
    problem: null,
    change: null,
    done_when: null,
    status,
    priority: 0,
    labels: [],
    links: [],
    branch: null,
    assignee: null,
    due_date: null,
    source: "board",
    created_at: ago(20 * DAY),
    updated_at: ago(DAY),
    status_changed_at: ago(2 * 60 * MINUTE),
    completed_at: null,
    git_state: "none",
    git_sha: null,
    ...checked,
    ...overrides,
  };
}

let items: WorkItem[] = [
  item("CORE-231", "Doctor cannot reopen a closed visit", "backlog", { priority: 2 }),
  item("NEO-164", "Invoice PDF shows the wrong tax id", "backlog", { labels: ["billing"], priority: 3, assignee: "ana.lopez@example.com" }),
  item("CORE-228", "Rate-limit the public questionnaire endpoint", "backlog", { labels: ["security", "api"], priority: 2, due_date: day(5) }),
  item("CORE-226", "Patient list filter by referring doctor", "spec_ready", { labels: ["frontend"], links: [spec], assignee: "Marta Nowak" }),
  item("NEO-160", "Monthly statement export for clinics", "approved", { labels: ["billing", "api"], priority: 1, due_date: day(-2), assignee: "jan.kowalski@example.com" }),
  item("CORE-219", "Work board: labels, lanes and session indicators", "building", {
    labels: ["session", "frontend", "api"],
    priority: 2,
    links: [spec, pr(531)],
    assignee: "lukasz.ostrowski@example.com",
    session_active_at: ago(3 * MINUTE),
    done_when: "- [x] Label catalog\n- [x] Lanes\n- [ ] Verified on dev",
    status_changed_at: ago(DAY + 60 * MINUTE),
  }),
  item("CORE-221", "Board statuses follow the git state", "building", {
    labels: ["session", "ci"],
    links: [pr(529), ci("failed")],
    status_changed_at: ago(9 * DAY),
    ...onDev("4be1a9c0d2"),
  }),
  item("CORE-214", "Webhook retries keep the original signature", "needs_review", {
    labels: ["session", "api", "security", "ci", "billing"],
    links: [pr(527), ci("passed")],
    status_changed_at: ago(4 * DAY),
    ...onDev("9a31f07b55"),
  }),
  item("NEO-158", "Consent form: second signature for minors", "needs_review", {
    labels: ["frontend"],
    links: [spec, pr(525), ci("passed")],
    assignee: "Marta Nowak",
    due_date: day(1),
    status_changed_at: ago(DAY),
    ...onProd("c500f14e21"),
  }),
  item("CORE-25", "Calendar sync with Google", "needs_review", { labels: ["hold", "api"], links: [pr(520)], status_changed_at: ago(6 * DAY), ...onProd("b768deb3aa") }),
  item("CORE-208", "Pin the CI runner image", "done", {
    labels: ["session", "ci"],
    links: [pr(526), ci("passed")],
    completed_at: ago(3 * DAY),
    status_changed_at: ago(3 * DAY),
    ...onProd("c500f14e21"),
  }),
  item("CORE-209", "Support inbox syncs with the platform", "done", {
    labels: ["api"],
    links: [pr(524)],
    completed_at: ago(5 * DAY),
    status_changed_at: ago(5 * DAY),
    ...onProd("b768deb3aa"),
  }),
  item("CORE-140", "Offline queue for visit notes", "canceled", { labels: ["frontend"] }),
  item("NEO-77", "Fax export for referrals", "canceled"),
];

/** The same short history on every ticket: created, then two moves (CORE-225). */
const who = { body: null, actor: "lukasz@example.com", actor_kind: "human" } as const;
const HISTORY: WorkItemEvent[] = [
  { id: "1", kind: "created", from_status: null, to_status: "backlog", created_at: "2026-11-10T10:00:00Z", ...who },
  { id: "2", kind: "status", from_status: "backlog", to_status: "approved", created_at: "2026-11-12T09:00:00Z", ...who },
  { id: "3", kind: "status", from_status: "approved", to_status: "building", created_at: "2026-11-14T15:30:00Z", ...who },
];

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = (typeof input === "string" ? input : input instanceof URL ? input.href : input.url).split("?")[0]!;
  if (!url.includes("/api/v1/platform/work")) return realFetch(input, init);
  const method = init?.method ?? "GET";
  const body = () => JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  const last = decodeURIComponent(url.split("/").pop()!);
  if (url.endsWith("/teams")) return json({ items: TEAMS });
  if (url.endsWith("/people")) return json({ items: [] });
  if (url.endsWith("/session-tokens")) return json({ items: TOKENS });
  if (url.endsWith("/labels")) return json({ items: LABELS });
  if (url.includes("/labels/")) {
    const label = LABELS.find((l) => l.id === last)!;
    const previous = label.name;
    Object.assign(label, body());
    items = items.map((i) => ({ ...i, labels: i.labels.map((name) => (name === previous ? label.name : name)) }));
    return json({ item: label });
  }
  if (url.endsWith("/items") && method === "GET") return json({ items });
  if (url.endsWith("/items") && method === "POST") {
    const created = item(`CORE-${232 + seq}`, "", "backlog", body() as Partial<WorkItem>);
    items.push(created);
    return json({ item: created }, 201);
  }
  const current = items.find((i) => i.key === last);
  if (current && method === "PATCH") {
    Object.assign(current, body());
    return json({ item: current });
  }
  if (current) return json({ item: current, events: HISTORY, attachments: [] });
  return json({ error: "Not found" }, 404);
};

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: WorkBoardView }],
});

const Harness = defineComponent({
  setup: () => () => h(VApp, () => h("main", { style: "padding:24px" }, h(WorkBoardView))),
});

// The board restores its filters from the query on setup, so the route has to be resolved first.
const app = createApp(Harness).use(createPinia()).use(i18n).use(vuetify).use(router);
void router.isReady().then(() => {
  app.mount("#app");
  document.getElementById("boot-splash")?.remove();
});
