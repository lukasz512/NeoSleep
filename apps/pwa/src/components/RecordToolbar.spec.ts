import { describe, it, expect, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import en from "@i18n/en.json";
import RecordToolbar from "./RecordToolbar.vue";

// NEO-181: the phone record toolbar — ‹ back, the main action and "⋯" with
// the rest — mirroring the header's own (hidden) buttons.

const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function makeActions() {
  const actions = document.createElement("div");
  const clicks: string[] = [];
  for (const [tone, label] of [
    ["success", "Activate"],
    ["success", "Book appointment"],
    ["primary", "Edit"],
    ["error", "Delete"],
  ] as const) {
    const b = document.createElement("button");
    b.className = `view-item__action-btn view-item__action-btn--${tone}`;
    b.setAttribute("aria-label", label);
    b.innerHTML = `<svg data-icon="${label}"></svg>`;
    b.addEventListener("click", () => clicks.push(label));
    actions.appendChild(b);
  }
  document.body.appendChild(actions);
  return { actions, clicks };
}

async function mountToolbar(props: Partial<InstanceType<typeof RecordToolbar>["$props"]> = {}) {
  const { actions, clicks } = makeActions();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { render: () => null } },
      { path: "/hcp", name: "hcp", component: { render: () => null } },
    ],
  });
  const wrapper = mount(RecordToolbar, {
    props: { back: { label: "Doctors", to: { name: "hcp" } }, actions, ...props },
    global: {
      plugins: [
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createPinia(),
        router,
      ],
    },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  await router.isReady();
  await nextTick();
  return { wrapper, actions, clicks };
}

describe("RecordToolbar", () => {
  it("shows ‹ + the module as the way back", async () => {
    const { wrapper } = await mountToolbar();
    const back = wrapper.find('[data-testid="record-toolbar-back"]');
    expect(back.attributes("href")).toBe("/hcp");
    expect(back.attributes("aria-label")).toBe("Doctors");
    expect(back.text()).toContain("Doctors");
  });

  it("puts the first non-destructive action next to ⋯ and clicks the original", async () => {
    const { wrapper, clicks } = await mountToolbar();
    const primary = wrapper.find('[data-testid="record-toolbar-primary"]');
    expect(primary.attributes("aria-label")).toBe("Activate");
    expect(primary.find('svg[data-icon="Activate"]').exists()).toBe(true);
    await primary.trigger("click");
    expect(clicks).toEqual(["Activate"]);
  });

  it("lists the rest in ⋯ with labels, delete last", async () => {
    const { wrapper, clicks } = await mountToolbar();
    await wrapper.find('[data-testid="record-toolbar-more"]').trigger("click");
    await nextTick();
    await nextTick();
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="record-toolbar-menu-item"]'));
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Book appointment", "Edit", "Delete"]);
    items[2]!.click();
    await nextTick();
    expect(clicks).toEqual(["Delete"]);
  });

  it("follows the header when an action disappears", async () => {
    const { wrapper, actions } = await mountToolbar();
    actions.querySelector('[aria-label="Activate"]')!.remove();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(wrapper.find('[data-testid="record-toolbar-primary"]').attributes("aria-label")).toBe("Book appointment");
  });

  it("holds action placeholders while the record loads", async () => {
    const { wrapper } = await mountToolbar({ actions: null, skeletons: 3 });
    expect(wrapper.findAll(".record-toolbar__skeleton")).toHaveLength(2);
    expect(wrapper.find('[data-testid="record-toolbar-primary"]').exists()).toBe(false);
  });
});
