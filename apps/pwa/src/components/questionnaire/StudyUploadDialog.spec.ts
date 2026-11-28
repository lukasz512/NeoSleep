import { describe, it, expect, afterEach, vi } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import StudyUploadDialog from "./StudyUploadDialog.vue";

/**
 * NEO-264: the file field is a native input opened by a button — the
 * VFileInput never opened the OS picker inside the dialog.
 */

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function mountDialog() {
  const vuetify = createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives });
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    messages: {
      en: {
        app: {
          common: { close: "Close", cancel: "Cancel" },
          clinical: {
            save: "Save",
            upload: {
              title: "Add study",
              file: "File",
              chooseFile: "Choose file",
              changeFile: "Change file",
              fileRequired: "Choose a file",
              titleField: "Title",
              titleRequired: "Title required",
              notes: "Notes",
              attachTo: "Attach to",
              attachHint: "Hint",
              newStudy: "New study",
            },
          },
        },
      },
    },
  });
  const w = mount(StudyUploadDialog, {
    props: { modelValue: true, items: [], itemTitle: () => "" },
    global: { plugins: [vuetify, i18n, createPinia()] },
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("[data-testid=study-upload-file]")!;
}

describe("StudyUploadDialog file picker", () => {
  it("opens the native file picker when the button is clicked", async () => {
    mountDialog();
    await nextTick();
    const click = vi.spyOn(fileInput(), "click");
    document.querySelector<HTMLButtonElement>("[data-testid=study-upload-pick]")!.click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("shows the chosen file's name and switches the button to 'Change file'", async () => {
    mountDialog();
    await nextTick();
    const input = fileInput();
    const file = new File(["x"], "psg-report.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    await nextTick();
    expect(document.body.textContent).toContain("psg-report.pdf");
    expect(document.querySelector("[data-testid=study-upload-pick]")!.textContent).toContain("Change file");
  });

  it("asks for a file when submitting without one", async () => {
    mountDialog();
    await nextTick();
    document.querySelector<HTMLFormElement>("#study-upload-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await nextTick();
    expect(document.body.textContent).toContain("Choose a file");
  });
});
