/**
 * DB-free harness for the platform work board (CORE-221) — served only by the Vite dev
 * server, never part of `vite build`. Mounts the real WorkBoardView and answers the work
 * board API from fixtures: three statuses with no tickets, git markers of every kind in
 * Building and Needs Review, one ticket on hold and two canceled ones.
 *
 * `?theme=dark` · `?lang=pl|mx`
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import { VApp } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import WorkBoardView from "../../src/views/WorkBoardView.vue";
import type { WorkItem, WorkTeam } from "../../src/types/workBoard";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.change(theme);
document.documentElement.setAttribute("data-theme", theme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") i18n.global.locale.value = lang;

const TEAMS: WorkTeam[] = [
  { key: "CORE", name: "Platform", kind: "platform" },
  { key: "NEO", name: "NeoSleep", kind: "client" },
];

function item(key: string, title: string, status: WorkItem["status"], extra: Partial<WorkItem> = {}): WorkItem {
  return {
    id: `id-${key}`,
    key,
    team_key: key.split("-")[0]!,
    number: Number(key.split("-")[1]),
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
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    status_changed_at: "2026-11-10T10:00:00Z",
    completed_at: null,
    git_state: null,
    git_sha: null,
    git_checked_at: null,
    ...extra,
  };
}

const checked = { git_checked_at: "2026-11-16T09:00:00Z" };
const ITEMS: WorkItem[] = [
  item("CORE-230", "Export the audit log as CSV", "backlog", { priority: 3, git_state: "none", ...checked }),
  item("NEO-214", "Second reminder before a sleep study", "backlog", { git_state: "none", ...checked }),
  item("CORE-228", "Rate-limit the public questionnaire link", "backlog", { priority: 2, git_state: "none", ...checked }),
  item("CORE-226", "Tenant branding preview in the admin panel", "approved", { priority: 2, git_state: "none", ...checked }),
  item("CORE-222", "Artifact preview on the ticket page", "building", { labels: ["session"], git_state: "none", ...checked }),
  item("NEO-212", "Doctor panel: referrals by month", "building", { priority: 2, git_state: "dev", git_sha: "4be1a9c0d2", ...checked }),
  item("CORE-219", "Notification digest email", "needs_review", { priority: 2, git_state: "none", ...checked }),
  item("CORE-217", "Calendar: drag an appointment to another day", "needs_review", { git_state: "dev", git_sha: "9a31f07b55", ...checked }),
  item("NEO-208", "Consent PDF shows the clinic address", "needs_review", { priority: 1, git_state: "prod", git_sha: "c500f14e21", ...checked }),
  item("CORE-25", "Calendar sync with Google", "needs_review", { labels: ["hold"], git_state: "prod", git_sha: "b768deb3aa", ...checked }),
  item("CORE-213", "Wire the scaffold tables", "done", { git_state: "prod", git_sha: "bb794f2c10", ...checked }),
  item("CORE-209", "Support tickets sync to the platform", "done", { git_state: "prod", git_sha: "b768deb3aa", ...checked }),
  item("CORE-208", "Pin CI to Ubuntu 24.04", "done", { git_state: "prod", git_sha: "c500f14e21", ...checked }),
  item("CORE-140", "Offline queue for visit notes", "canceled", { git_state: "none", ...checked }),
  item("NEO-77", "Fax export for referrals", "canceled", { git_state: "none", ...checked }),
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/v1/platform/work")) return realFetch(input, init);
  const method = init?.method ?? "GET";
  if (url.endsWith("/teams")) return json({ items: TEAMS });
  if (url.endsWith("/items")) return json({ items: ITEMS });
  if (url.endsWith("/people")) return json({ items: [] });
  const key = decodeURIComponent(/\/items\/([^/]+)$/.exec(url)?.[1] ?? "");
  const index = ITEMS.findIndex((i) => i.key === key);
  if (index < 0) return json({ error: "Not found" }, 404);
  if (method === "PATCH") ITEMS[index] = { ...ITEMS[index]!, ...(JSON.parse(String(init?.body)) as Partial<WorkItem>) };
  return json({ item: ITEMS[index], events: [], attachments: [] });
};

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: "/:pathMatch(.*)*", component: WorkBoardView }],
});

createApp({ render: () => h(VApp, () => h("main", { style: "padding:24px" }, h(RouterView))) })
  .use(createPinia())
  .use(i18n)
  .use(vuetify)
  .use(router)
  .mount("#app");
document.getElementById("boot-splash")?.remove();
