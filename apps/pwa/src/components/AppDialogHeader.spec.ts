import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import AppDialogHeader from "./AppDialogHeader.vue";
import AppAvatar from "./AppAvatar.vue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..");

const mountedWrappers: VueWrapper[] = [];
afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
});

function mountHeader(props: InstanceType<typeof AppDialogHeader>["$props"]) {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en: { app: { common: { close: "Close" } } } } });
  const wrapper = mount(AppDialogHeader, { props, global: { plugins: [vuetify, i18n, createPinia()] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppDialogHeader", () => {
  it("renders avatar, then title, then the close button last (pinned right)", () => {
    const w = mountHeader({ title: "Edit patient", avatarEntityType: "patient", avatarName: "Maria Diaz" });
    const root = w.get("[data-testid=app-dialog-header]");
    // Close must be the header's last child, outside the avatar+title group —
    // that's what lets margin-left:auto pin it to the right edge.
    const children = Array.from(root.element.children);
    expect(children).toHaveLength(2);
    expect(children[0].classList.contains("app-dialog-header__lead")).toBe(true);
    expect(children[1].getAttribute("data-testid")).toBe("app-dialog-header-close");
    const lead = Array.from(children[0].children);
    expect(lead[0].classList.contains("app-dialog-header__avatar")).toBe(true);
    expect(lead[1].textContent).toBe("Edit patient");
    expect(w.findComponent(AppAvatar).props("name")).toBe("Maria Diaz");
  });

  it("is a plain element, not a VCardTitle (Vuetify's card-title CSS broke the flex row)", () => {
    const w = mountHeader({ title: "Edit patient" });
    expect(w.get("[data-testid=app-dialog-header]").classes()).not.toContain("v-card-title");
    expect(w.find(".v-card-title").exists()).toBe(false);
  });

  it("emits close when X is clicked, with an accessible label", async () => {
    const w = mountHeader({ title: "Edit patient" });
    const close = w.get("[data-testid=app-dialog-header-close]");
    expect(close.attributes("aria-label")).toBe("Close");
    await close.trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });

  it("omits the avatar when no entity type is given, and the X when closable=false", () => {
    const w = mountHeader({ title: "Delete?", closable: false });
    expect(w.findComponent(AppAvatar).exists()).toBe(false);
    expect(w.find("[data-testid=app-dialog-header-close]").exists()).toBe(false);
  });
});

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return full.endsWith(".vue") ? [full] : [];
  });
}

describe("dialog headers — one shared component, everywhere", () => {
  const dialogFiles = vueFiles(SRC).filter((f) => readFileSync(f, "utf-8").includes("<VDialog"));

  it("finds the dialogs it is guarding (sanity check on the scan itself)", () => {
    const names = dialogFiles.map((f) => path.basename(f));
    expect(names).toEqual(expect.arrayContaining(["FormRenderer.vue", "EventForm.vue", "OrthoApneaOrderWizard.vue"]));
  });

  it.each(dialogFiles.map((f) => [path.relative(SRC, f), f]))(
    "%s uses AppDialogHeader, never a hand-built VCardTitle header",
    (_rel, file) => {
      const source = readFileSync(file, "utf-8");
      expect(source).not.toMatch(/<VCardTitle[\s>]/);
      expect(source).not.toMatch(/pwa-form-dialog__title-row|pwa-form-dialog__close-icon/);
    },
  );

  it("theme.scss no longer styles dialog titles globally", () => {
    const scss = readFileSync(path.join(SRC, "assets/theme.scss"), "utf-8");
    expect(scss).not.toMatch(/\.pwa-form-dialog__card \.v-card-title|\.pwa-form-dialog__title-row \{/);
  });
});
