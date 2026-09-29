import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import AppFormDialog from "./AppFormDialog.vue";
import AppConfirmDialog from "./AppConfirmDialog.vue";

/**
 * "The forms don't scroll" came back more than once, each time from one
 * hand-built dialog missing a piece of the scroll model. The fix is
 * structural: every dialog renders through AppFormDialog / AppConfirmDialog,
 * and this spec keeps it that way. The actual scrolling is measured in real
 * browsers by e2e/dialog-scroll.spec.ts (jsdom has no layout).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "..");

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function plugins() {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en: { app: { common: { close: "Close" } } } } });
  return [vuetify, i18n, createPinia()];
}

async function mountDialog(props: Record<string, unknown> = {}, withActions = true) {
  const w = mount(AppFormDialog, {
    props: { modelValue: true, title: "Edit patient", ...props },
    slots: {
      default: () => h("p", { class: "body-probe" }, "Body"),
      ...(withActions ? { actions: () => h("button", { class: "action-probe" }, "Save") } : {}),
    },
    global: { plugins: plugins() },
    attachTo: document.body,
  });
  mounted.push(w);
  await nextTick();
  await nextTick();
  return w;
}

describe("AppFormDialog", () => {
  it("renders header → scrolling body → actions, in that order, inside one card", async () => {
    await mountDialog();
    const card = document.querySelector("[data-testid=app-form-dialog]");
    expect(card?.classList.contains("pwa-form-dialog__card")).toBe(true);
    // VCard also renders its own loader/overlay children; only ours matter here.
    const ours = Array.from(card?.children ?? []).filter(
      (c) => c.matches("[data-testid=app-dialog-header], [data-testid=app-form-dialog-body], .pwa-form-dialog__actions"),
    );
    expect(ours.map((c) => c.getAttribute("data-testid") ?? "actions")).toEqual([
      "app-dialog-header",
      "app-form-dialog-body",
      "actions",
    ]);
    expect(ours[1].querySelector(".body-probe")).not.toBeNull();
    expect(ours[2].querySelector(".action-probe")).not.toBeNull();
    expect(document.querySelector("[data-testid=app-dialog-header-title]")?.textContent).toBe("Edit patient");
  });

  it("is always a scrollable VDialog with the shared classes (content + overlay z-index)", async () => {
    await mountDialog();
    const overlay = document.querySelector(".v-overlay.v-dialog");
    expect(overlay?.classList.contains("v-dialog--scrollable")).toBe(true);
    expect(overlay?.classList.contains("pwa-form-dialog")).toBe(true);
    expect(document.querySelector(".v-overlay__content")?.classList.contains("pwa-form-dialog__content")).toBe(true);
  });

  it("omits the actions row when no actions slot is given", async () => {
    await mountDialog({}, false);
    expect(document.querySelector(".pwa-form-dialog__actions")).toBeNull();
  });

  it("emits close from the header X and leaves closing to the caller", async () => {
    const w = await mountDialog();
    (document.querySelector("[data-testid=app-dialog-header-close]") as HTMLElement).click();
    await nextTick();
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("update:modelValue")).toBeUndefined();
  });

  it("marks the body as 'more below' when content overflows, 'scrolled' once scrolled", async () => {
    await mountDialog();
    const body = document.querySelector("[data-testid=app-form-dialog-body]") as HTMLElement;
    // jsdom has no layout: fake the three numbers the component reads.
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(body, "clientHeight", { configurable: true, value: 300 });
    body.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(body.classList.contains("pwa-form-dialog__body--more")).toBe(true);
    expect(body.classList.contains("pwa-form-dialog__body--scrolled")).toBe(false);

    body.scrollTop = 600;
    body.dispatchEvent(new Event("scroll"));
    await nextTick();
    expect(body.classList.contains("pwa-form-dialog__body--more")).toBe(false);
    expect(body.classList.contains("pwa-form-dialog__body--scrolled")).toBe(true);
  });
});

describe("AppConfirmDialog", () => {
  it("keeps the confirm card class, stays persistent by default and emits both choices", async () => {
    const w = mount(AppConfirmDialog, {
      props: { modelValue: true, text: "Delete?", secondaryLabel: "Cancel", primaryLabel: "Delete" },
      global: { plugins: plugins() },
      attachTo: document.body,
    });
    mounted.push(w);
    await nextTick();
    await nextTick();
    expect(document.querySelector(".pwa-confirm-dialog__card")).not.toBeNull();
    expect(document.querySelector(".v-overlay.pwa-discard-dialog")).not.toBeNull();
    expect(w.findComponent({ name: "VDialog" }).props("persistent")).toBe(true);
    const buttons = Array.from(document.querySelectorAll(".pwa-confirm-dialog__card .v-card-actions button"));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(["Cancel", "Delete"]);
    (buttons[0] as HTMLElement).click();
    (buttons[1] as HTMLElement).click();
    expect(w.emitted("secondary")).toHaveLength(1);
    expect(w.emitted("primary")).toHaveLength(1);
  });
});

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return vueFiles(full);
    return full.endsWith(".vue") ? [full] : [];
  });
}

/**
 * The only files allowed a raw <VDialog>: the two shells, plus two
 * full-screen viewers with their own chrome and their own scroller
 * (a slide deck and a legal-document reader) — neither is a form.
 */
const RAW_VDIALOG_ALLOWED = new Set([
  "components/AppFormDialog.vue",
  "components/AppConfirmDialog.vue",
  "components/PresentationViewer.vue",
  "components/partner/PartnerDocumentDialog.vue",
]);

describe("dialogs — one shell, everywhere", () => {
  const files = vueFiles(SRC).map((f) => ({ rel: path.relative(SRC, f).split(path.sep).join("/"), src: readFileSync(f, "utf-8") }));

  it("finds the dialogs it is guarding (sanity check on the scan itself)", () => {
    const users = files.filter((f) => f.src.includes("<AppFormDialog")).map((f) => path.basename(f.rel));
    expect(users).toEqual(
      expect.arrayContaining(["FormRenderer.vue", "EventForm.vue", "OrthoApneaOrderWizard.vue", "ClinicalQuestionnaireDialog.vue"]),
    );
  });

  it.each(files.filter((f) => !RAW_VDIALOG_ALLOWED.has(f.rel)).map((f) => [f.rel, f.src]))(
    "%s: no raw <VDialog> — use AppFormDialog (forms) or AppConfirmDialog (confirms)",
    (_rel, src) => {
      expect(src).not.toMatch(/<VDialog\b/);
      // The shell classes belong to the shells; hand-applying them is how a
      // dialog ends up half-migrated (the card class without the scroll body).
      expect(src).not.toMatch(/\bpwa-(form|confirm)-dialog__card\b/);
    },
  );

  it("no form dialog re-implements the body scroller with a local max-height hack", () => {
    // OrthoApneaOrderWizard used `.oa-wizard__body { max-height: 55vh; overflow-y: auto }`
    // to paper over the missing dialog scroll model. (Full pages may keep
    // their own inner scrollers — this is about dialogs only.)
    for (const f of files.filter((x) => x.src.includes("<AppFormDialog"))) {
      expect(f.src, f.rel).not.toMatch(/max-height:\s*\d+(\.\d+)?d?vh;\s*overflow-y:\s*auto/);
    }
  });
});
