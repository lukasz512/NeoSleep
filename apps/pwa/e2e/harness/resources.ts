/**
 * DB-free harness for e2e/resources-grid-width.spec.ts — served only by the
 * Vite dev server, never part of `vite build`. Mounts the real ResourcesView
 * inside a stand-in for AppLayout's content sheet. Whether the video grid
 * overflows its scroll container sideways (NEO-234) is a layout fact only a
 * real browser engine computes.
 *
 * The resources and progress endpoints are answered in the page itself
 * (window.fetch stub), so no API or DB is needed.
 */
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import vuetify, { lightTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/styles/theme.scss";
import "../../src/styles/app-responsive.scss";
import ResourcesView from "../../src/views/ResourcesView.vue";

vuetify.theme.change(lightTheme);

const TOPICS = ["detect", "diagnose", "records"];
const RESOURCES = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  partner: "orthoapnea",
  kind: "video",
  title: `Webinar ${i + 1}: detecting obstructive sleep apnea in the dental clinic`,
  description: "Dr. Test Author",
  mediaUrl: "/media/none",
  fileType: "video",
  languages: [
    { code: "es", mediaUrl: "/media/none" },
    { code: "en", mediaUrl: "/media/none" },
  ],
  category: "Webinar",
  subcategory: null,
  weight: 1,
  posterUrl: null,
  durationSec: 1800 + i * 60,
  topic: TOPICS[i % TOPICS.length],
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/partners/orthoapnea/resources/progress")) return Promise.resolve(json({ progress: [] }));
  if (url.includes("/partners/orthoapnea/resources")) return Promise.resolve(json({ resources: RESOURCES, mediaToken: "t" }));
  return realFetch(input, init);
};

const Stub = { render: () => null };
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/", component: Stub }] });

// AppLayout.vue's desktop sheet: the page gutter as padding.
const Harness = () =>
  h(
    "div",
    {
      "data-testid": "harness-sheet",
      style: "margin: 12px; padding: 24px; background: #fff; border-radius: 16px; display: flex; flex-direction: column",
    },
    [h(ResourcesView)],
  );

document.body.style.background = "#dfe5e3";
document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(router).use(vuetify).use(i18n).mount("#app");
