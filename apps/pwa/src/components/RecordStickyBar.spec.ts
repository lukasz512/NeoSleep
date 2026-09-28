import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import { createPinia } from "pinia";
import RecordStickyBar from "./RecordStickyBar.vue";

// NEO-158: on phones, once the record header scrolls away a slim bar shows the
// name, the main action and "⋯" with the rest — tapping clicks the original.

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
let ioCallback: IOCallback | null = null;
let ioOptions: IntersectionObserverInit | undefined;

class FakeIntersectionObserver {
  constructor(cb: IOCallback, options?: IntersectionObserverInit) {
    ioCallback = cb;
    ioOptions = options;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function makeHeader() {
  const header = document.createElement("header");
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
  header.appendChild(actions);
  document.body.appendChild(header);
  return { header, actions, clicks };
}

function mountBar() {
  const { header, actions, clicks } = makeHeader();
  const vuetify = createVuetify({
    components: vuetifyComponents,
    directives: vuetifyDirectives,
  });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const wrapper = mount(RecordStickyBar, {
    props: { title: "Dr. Anna Kowalska", header, actions },
    global: { plugins: [vuetify, i18n, createPinia()] },
    attachTo: document.body,
  });
  wrappers.push(wrapper);
  return { wrapper, actions, clicks };
}

const bar = (w: VueWrapper) => w.find('[data-testid="record-sticky-bar"]');
const scroll = async (entry: Partial<IntersectionObserverEntry>) => {
  ioCallback?.([entry]);
  await nextTick();
};

describe("RecordStickyBar", () => {
  it("is hidden (and inert) while the header is on screen", async () => {
    const { wrapper } = mountBar();
    await nextTick();
    await scroll({
      isIntersecting: true,
      boundingClientRect: { top: 80 } as DOMRect,
    });
    expect(bar(wrapper).classes()).not.toContain("record-bar--visible");
    expect(bar(wrapper).attributes("inert")).toBeDefined();
  });

  it("appears once the header has scrolled up under the app bar", async () => {
    const { wrapper } = mountBar();
    await nextTick();
    await scroll({
      isIntersecting: false,
      boundingClientRect: { top: -200 } as DOMRect,
    });
    expect(bar(wrapper).classes()).toContain("record-bar--visible");
    expect(bar(wrapper).attributes("inert")).toBeUndefined();
  });

  it("stays hidden when the header is merely below the fold", async () => {
    const { wrapper } = mountBar();
    await nextTick();
    await scroll({
      isIntersecting: false,
      boundingClientRect: { top: 900 } as DOMRect,
    });
    expect(bar(wrapper).classes()).not.toContain("record-bar--visible");
  });

  it("watches the header from under the app bar (negative top root margin)", async () => {
    mountBar();
    await nextTick();
    expect(ioOptions?.rootMargin).toMatch(/^-\d+(\.\d+)?px 0px 0px 0px$/);
  });

  it("shows the name and the first non-destructive action, which clicks the original", async () => {
    const { wrapper, clicks } = mountBar();
    await nextTick();
    expect(wrapper.find('[data-testid="record-sticky-bar-title"]').text()).toBe(
      "Dr. Anna Kowalska",
    );
    const primary = wrapper.find('[data-testid="record-sticky-bar-primary"]');
    expect(primary.attributes("aria-label")).toBe("Activate");
    expect(primary.find('svg[data-icon="Activate"]').exists()).toBe(true);
    await primary.trigger("click");
    expect(clicks).toEqual(["Activate"]);
  });

  it("lists the other actions with labels in ⋯, delete last, and runs the original", async () => {
    const { wrapper, clicks } = mountBar();
    await nextTick();
    await wrapper
      .find('[data-testid="record-sticky-bar-more"]')
      .trigger("click");
    await nextTick();
    await nextTick();
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="record-sticky-bar-menu-item"]',
      ),
    );
    expect(items.map((i) => i.textContent?.trim())).toEqual([
      "Book appointment",
      "Edit",
      "Delete",
    ]);
    items[2]!.click();
    await nextTick();
    expect(clicks).toEqual(["Delete"]);
  });

  it("follows the header when an action disappears", async () => {
    const { wrapper, actions } = mountBar();
    await nextTick();
    actions.querySelector('[aria-label="Activate"]')!.remove();
    await new Promise((r) => setTimeout(r, 0));
    await nextTick();
    expect(
      wrapper
        .find('[data-testid="record-sticky-bar-primary"]')
        .attributes("aria-label"),
    ).toBe("Book appointment");
  });
});
