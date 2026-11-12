/**
 * DB-free harness for e2e/work-item-dialog.spec.ts (CORE-195) — served only by
 * the Vite dev server, never part of `vite build`. Mounts the real
 * WorkItemDialog behind a stand-in board card and answers the work board API
 * from fixtures, so a real browser can check what jsdom can't: the file picker
 * opens, the dialog keeps its content while it fades out, and it opens without
 * a loader flash.
 *
 * `?delay=<ms>` slows the item fetch (default 400) · `?theme=dark` · `?lang=pl|mx`
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import { VApp } from "vuetify/components";
import vuetify, { darkTheme, lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import WorkItemDialog from "../../src/components/workBoard/WorkItemDialog.vue";
import type { WorkItem, WorkTeam } from "../../src/types/workBoard";

const params = new URLSearchParams(location.search);
const theme = params.get("theme") === "dark" ? darkTheme : lightTheme;
vuetify.theme.change(theme);
document.documentElement.setAttribute("data-theme", theme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") i18n.global.locale.value = lang;
const delay = Number(params.get("delay") ?? 400);

const TEAMS: WorkTeam[] = [{ key: "CORE", name: "Platform", kind: "platform" }];
const ITEM: WorkItem = {
  id: "item-111",
  key: "CORE-111",
  team_key: "CORE",
  number: 111,
  title: "GDPR: report of cross-doctor patient reads on prod",
  problem: "Before CORE-104 any doctor could open patients assigned to other doctors.",
  change: "Query the audit log for reads of patients not assigned to the doctor.",
  done_when: "- [ ] Report delivered privately\n- [x] Legal assessment written",
  status: "backlog",
  priority: 1,
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
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/v1/platform/work")) return realFetch(input, init);
  const method = init?.method ?? "GET";
  if (url.endsWith("/people")) return json({ items: [] });
  if (url.endsWith("/attachments") && method === "POST") {
    const file = (init?.body as FormData).get("file") as File;
    return json({ attachment: { id: `a${Date.now()}`, item_id: ITEM.id, event_id: null, filename: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: "qa@example.com", created_at: new Date().toISOString() } }, 201);
  }
  if (/\/items\/[^/]+$/.test(url) && method === "GET") {
    await wait(delay);
    return json({ item: ITEM, events: [{ id: "1", kind: "created", from_status: null, to_status: "backlog", body: null, actor: "qa@example.com", actor_kind: "human", created_at: ITEM.created_at }], attachments: [] });
  }
  return json({ item: ITEM });
};

const Harness = defineComponent({
  setup() {
    const openKey = ref<string | null>(null);
    return () =>
      h(VApp, () => [
        h("main", { style: "padding:24px" }, [
          h("button", { type: "button", "data-testid": "board-card", style: "padding:12px;border:1px solid #ccc;border-radius:8px", onClick: () => (openKey.value = ITEM.key) }, `${ITEM.key} · ${ITEM.title}`),
        ]),
        h(WorkItemDialog, {
          itemKey: openKey.value,
          creating: false,
          teams: TEAMS,
          defaultTeam: "CORE",
          initialItem: ITEM,
          onClose: () => (openKey.value = null),
        }),
      ]);
  },
});

createApp(Harness).use(createPinia()).use(i18n).use(vuetify).mount("#app");
document.getElementById("boot-splash")?.remove();
