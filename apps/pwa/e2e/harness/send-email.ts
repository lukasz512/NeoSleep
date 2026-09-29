/**
 * DB-free harness for the "Send by email" dialog (NEO-192) — served only by
 * the Vite dev server, never part of `vite build`. Mounts the real
 * SendEmailDialog with the real Vuetify plugin and global stylesheet and a
 * fixed patient: three online documents (one already signed) and two past
 * emails (one delivered, one bounced). `?theme=dark`, `?lang=pl|mx|en`,
 * `?recipient=none` (a record without an email).
 */
import { createApp, defineComponent, h, ref } from "vue";
import { createPinia } from "pinia";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n, loadLocale } from "../../src/plugins/i18n";
import "../../src/assets/theme.scss";
import "../../src/assets/app-responsive.scss";
import SendEmailDialog from "../../src/components/questionnaire/SendEmailDialog.vue";
import type { ChecklistItem, EmailSend } from "../../src/composables/usePatientChecklist";

const params = new URLSearchParams(location.search);
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const lang = params.get("lang");
if (lang === "pl" || lang === "mx") {
  await loadLocale(lang);
  i18n.global.locale.value = lang;
}

const TITLES: Record<string, string> = {
  informedConsent: "app.clinical.item.informedConsent",
  medicalHistory: "app.clinical.item.medicalHistory",
  stopBang: "app.clinical.item.stopBang",
};

function item(key: string, status: ChecklistItem["status"]): ChecklistItem {
  return {
    key,
    templateKey: key,
    label: key,
    fillMode: key === "informedConsent" ? "consent" : "patient",
    group: "patient",
    status,
    completed_at: null,
    history: [],
    pending_request_id: null,
    actions: { qr: true, fill: null, form: null, print: true, upload: true },
  } as ChecklistItem;
}

const sends: EmailSend[] = [
  { id: "s1", kind: "questionnaire_link", sent_to_masked: "l***@example.mx", status: "bounced", status_detail: "Mailbox does not exist", status_at: null, created_at: "2026-09-28T16:20:00Z", questionnaire_request_id: null },
  { id: "s2", kind: "questionnaire_link", sent_to_masked: "l***@example.mx", status: "delivered", status_detail: null, status_at: null, created_at: "2026-09-27T09:30:00Z", questionnaire_request_id: null },
  { id: "s3", kind: "signed_copy", sent_to_masked: "l***@example.mx", status: "sent", status_detail: null, status_at: null, created_at: "2026-09-26T12:05:00Z", questionnaire_request_id: null },
];

const Harness = defineComponent({
  setup() {
    const open = ref(true);
    const title = (i: ChecklistItem) => {
      const key = TITLES[i.key];
      return key && i18n.global.te(key) ? i18n.global.t(key) : i.key;
    };
    return () =>
      h(SendEmailDialog, {
        modelValue: open.value,
        "onUpdate:modelValue": (v: boolean) => (open.value = v),
        items: [item("informedConsent", "done"), item("medicalHistory", "missing"), item("stopBang", "pending_patient")],
        openKeys: ["medicalHistory", "stopBang"],
        recipient: params.get("recipient") === "none" ? null : "l***@example.mx",
        sends,
        sending: false,
        lastUrl: null,
        itemTitle: title,
        formatDateTime: (v: string) => new Date(v).toLocaleString(String(i18n.global.locale.value), { dateStyle: "short", timeStyle: "short" }),
      });
  },
});

createApp(Harness).use(createPinia()).use(vuetify).use(i18n).mount("#app");
// Same as dialog-header.ts: the boot splash vite.config.ts injects isn't dismissed here.
document.getElementById("boot-splash")?.remove();
