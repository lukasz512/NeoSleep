import { describe, it, expect, afterEach } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as vuetifyComponents from "vuetify/components";
import * as vuetifyDirectives from "vuetify/directives";
import { createI18n } from "vue-i18n";
import { createPinia } from "pinia";
import en from "@i18n/en.json";
import SendEmailDialog from "./SendEmailDialog.vue";
import type { ChecklistItem, EmailSend } from "../../composables/usePatientChecklist";

/** NEO-192: the "Send by email" dialog — what is pre-checked, what gets sent, how the history reads. */
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount();
  document.body.innerHTML = "";
});

function item(key: string, status: ChecklistItem["status"]): ChecklistItem {
  return {
    key,
    templateKey: key,
    label: key,
    fillMode: "patient",
    group: "patient",
    status,
    completed_at: null,
    history: [],
    pending_request_id: null,
    actions: { qr: true, fill: null, form: null, print: true, upload: true },
  } as ChecklistItem;
}

const SENDS: EmailSend[] = [
  { id: "s1", kind: "questionnaire_link", sent_to_masked: "l***@example.mx", status: "bounced", status_detail: "Mailbox does not exist", status_at: null, created_at: "2026-09-29T10:00:00Z", questionnaire_request_id: null },
  { id: "s2", kind: "questionnaire_link", sent_to_masked: "l***@example.mx", status: "delivered", status_detail: null, status_at: null, created_at: "2026-09-28T10:00:00Z", questionnaire_request_id: null },
];

async function mountDialog(props: Record<string, unknown> = {}) {
  const w = mount(SendEmailDialog, {
    props: {
      modelValue: true,
      items: [item("informedConsent", "done"), item("medicalHistory", "missing"), item("stopBang", "pending_patient")],
      openKeys: ["medicalHistory", "stopBang"],
      recipient: "l***@example.mx",
      sends: SENDS,
      sending: false,
      lastUrl: null,
      itemTitle: (i: ChecklistItem) => i.key,
      formatDateTime: (v: string) => v.slice(0, 10),
      ...props,
    },
    global: {
      plugins: [
        createVuetify({ components: vuetifyComponents, directives: vuetifyDirectives }),
        createI18n({ legacy: false, locale: "en", messages: { en } }),
        createPinia(),
      ],
    },
    attachTo: document.body,
  });
  mounted.push(w);
  await nextTick();
  await nextTick();
  return w;
}

function checkbox(key: string): HTMLInputElement {
  return document.querySelector(`[data-testid=send-email-item-${key}] input`) as HTMLInputElement;
}

describe("SendEmailDialog (NEO-192)", () => {
  it("pre-checks only what the patient hasn't done and shows where it goes", async () => {
    await mountDialog();
    expect(checkbox("medicalHistory").checked).toBe(true);
    expect(checkbox("stopBang").checked).toBe(true);
    expect(checkbox("informedConsent").checked).toBe(false);
    expect(document.querySelector("[data-testid=send-email-to]")?.textContent).toContain("l***@example.mx");
    expect(document.body.textContent).toContain(en["app.clinical.email.spamHint"]);
  });

  it("sends the checked documents and the confirmation choice", async () => {
    const w = await mountDialog();
    checkbox("stopBang").click();
    await nextTick();
    (document.getElementById("send-email-form") as HTMLFormElement).requestSubmit();
    await nextTick();
    expect(w.emitted("send")).toEqual([[{ items: ["medicalHistory"], copyToMe: false }]]);
  });

  it("shows each past email's delivery status, a bounce as 'Didn't arrive'", async () => {
    await mountDialog();
    expect(document.querySelector("[data-testid=send-email-row-bounced]")?.textContent).toContain(en["app.clinical.email.status.bounced"]);
    expect(document.querySelector("[data-testid=send-email-row-delivered]")?.textContent).toContain(en["app.clinical.email.status.delivered"]);
  });

  it("without an email on the record: a warning and no Send button", async () => {
    await mountDialog({ recipient: null });
    expect(document.body.textContent).toContain(en["app.clinical.email.noEmail"]);
    expect(document.querySelector("button[form=send-email-form]")).toBeNull();
  });
});
