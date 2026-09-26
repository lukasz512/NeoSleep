/**
 * DB-free harness for e2e/dialog-header.spec.ts — served only by the Vite dev
 * server (never part of `vite build`, whose only input is index.html). Mounts
 * the real dialogs with the real Vuetify plugin and the real global stylesheet,
 * in the same import order as main.ts, because the bugs this guards against
 * (Vuetify's lazily-injected component CSS overriding global dialog rules)
 * only exist in a real browser with a real CSS cascade — jsdom can't see them.
 *
 * `?dialog=form` (default) mounts FormRenderer in edit mode with an avatar —
 * the shell of every entity edit view; `?dialog=form-long` the same with a
 * real-length field list. `?dialog=event` mounts EventForm, `?dialog=confirm`
 * AppConfirmDialog, `?dialog=wizard` the OrthoApnea order wizard,
 * `?dialog=clinical` the medical-history questionnaire (a long checklist).
 * `?theme=dark` switches the theme. `&reject=<field>`
 * makes the folder form's Save come back as if the API rejected that field
 * (NEO-109, e2e/form-errors.spec.ts). Also used by e2e/dialog-scroll.spec.ts.
 */
import { createApp, defineComponent, h } from "vue";
import { createPinia } from "pinia";
import vuetify, { lightTheme, darkTheme } from "../../src/plugins/vuetify";
import { i18n } from "../../src/plugins/i18n";
import "../../src/assets/theme.scss";
import "../../src/assets/app-responsive.scss";
import FormRenderer from "../../src/components/FormRenderer.vue";
import EventForm from "../../src/components/EventForm.vue";
import AppConfirmDialog from "../../src/components/AppConfirmDialog.vue";
import OrthoApneaOrderWizard from "../../src/components/patient/OrthoApneaOrderWizard.vue";
import ClinicalQuestionnaireDialog from "../../src/components/questionnaire/ClinicalQuestionnaireDialog.vue";
import type { FormFieldDef } from "../../src/types/formField";
import type { SubmitDone } from "../../src/composables/useEntitySubmit";
import { identityFields } from "../../src/config/forms/identityFields";

const params = new URLSearchParams(location.search);
const dialog = params.get("dialog") ?? "form";
vuetify.theme.change(params.get("theme") === "dark" ? darkTheme : lightTheme);
const reject = params.get("reject");

const fields: FormFieldDef[] = [
  { key: "first_name", type: "text", labelKey: "app.identity.form.firstName", cols: 6 },
  { key: "last_name", type: "text", labelKey: "app.identity.form.lastName", cols: 6 },
  { key: "email", type: "email", labelKey: "app.identity.form.email" },
];

// A real-length entity form (a patient/HCP edit is ~15 fields): taller than
// any phone and most laptop viewports, which is what e2e/dialog-scroll.spec.ts
// needs to prove the body scrolls and Save stays reachable.
const longFields: FormFieldDef[] = [
  ...fields,
  ...Array.from({ length: 12 }, (_, i): FormFieldDef => ({
    key: `extra_${i}`,
    type: "text",
    labelKey: "app.identity.form.lastName",
  })),
  { key: "notes", type: "textarea", labelKey: "app.identity.form.email" },
];

// The "Carpeta" folder (NEO-92): a patient-shaped form spread over four
// sections, with the real shared identity fields and static options only
// (the API isn't running here). `?dialog=folder` edits María, `&mode=create`
// opens the same view empty.
const folderFields: FormFieldDef[] = [
  ...identityFields(),
  {
    key: "gender",
    type: "choice",
    labelKey: "app.patients.form.gender",
    section: "identity",
    options: [
      { title: "app.patients.form.genderFemale", value: "female" },
      { title: "app.patients.form.genderMale", value: "male" },
    ],
    cols: 6,
  },
  { key: "date_of_birth", type: "date", labelKey: "app.patients.form.dateOfBirth", section: "identity", cols: 6 },
  {
    key: "status",
    type: "select",
    labelKey: "app.patients.form.status",
    section: "clinical",
    options: [
      { title: "app.patients.filters.statusActive", value: "active", color: "success" },
      { title: "app.patients.filters.statusFollowUp", value: "follow_up", color: "warning" },
    ],
    default: "active",
    cols: 6,
  },
  { key: "ahi_baseline", type: "number", labelKey: "app.patients.form.ahiBaseline", section: "clinical", cols: 6 },
  { key: "medical_record", type: "text", labelKey: "app.patients.form.medicalRecord", section: "clinical" },
  { key: "cpap_device", type: "boolean", labelKey: "app.patients.form.cpapDevice", section: "clinical", trueValue: "CPAP", falseValue: "" },
  { key: "region", type: "text", labelKey: "app.patients.form.region", section: "territory", cols: 6 },
  { key: "city", type: "text", labelKey: "user.hco.form.city", section: "territory", cols: 6 },
];

const Harness = defineComponent({
  setup() {
    return () => {
      if (dialog === "folder") {
        const create = params.get("mode") === "create";
        return h(FormRenderer, {
          modelValue: true,
          fields: folderFields,
          initialData: create
            ? undefined
            : {
                id: "p1",
                title: "Sra.",
                first_name: "María",
                last_name: "Delgado Ruiz",
                email: "maria.delgado@example.com",
                phone: "+525512345678",
                gender: "female",
                date_of_birth: "1979-03-14",
                status: "active",
                ahi_baseline: 23.4,
                medical_record: "HX-88213",
                region: "CDMX",
                city: "Benito Juárez",
              },
          titleKey: "app.patients.form.title",
          editTitleKey: "app.patients.form.editTitle",
          submitLabelKey: "app.patients.form.submit",
          editSubmitLabelKey: "app.patients.form.editSubmit",
          avatarEntityType: "patient",
          // The API isn't running: Save either names a rejected field or fails plainly.
          onSubmit: (_payload: Record<string, unknown>, done: SubmitDone) =>
            reject ? done(false, { [reject]: `app.formRenderer.validation.server.${reject}` }) : done(false),
        });
      }
      if (dialog === "clinical") {
        return h(ClinicalQuestionnaireDialog, { modelValue: true, kind: "medical_history", mode: "create" });
      }
      if (dialog === "form-long") {
        return h(FormRenderer, {
          modelValue: true,
          fields: longFields,
          initialData: { id: "p1", first_name: "Maria", last_name: "Diaz", email: "maria.diaz@example.com" },
          titleKey: "app.patients.form.title",
          editTitleKey: "app.patients.form.editTitle",
          submitLabelKey: "app.patients.form.submit",
          editSubmitLabelKey: "app.patients.form.editSubmit",
          avatarEntityType: "patient",
        });
      }
      if (dialog === "event") {
        return h(EventForm, { modelValue: true, initialData: { id: "e1", title: "Team sync" } });
      }
      if (dialog === "wizard") {
        // Its option lists come from the API, which this harness doesn't run —
        // they stay empty, the dialog shell itself renders normally.
        return h(OrthoApneaOrderWizard, { modelValue: true, patientId: "p1", sleepStudyId: "s1" });
      }
      if (dialog === "confirm") {
        return h(AppConfirmDialog, {
          modelValue: true,
          title: i18n.global.t("app.treatmentPlans.deleteConfirmTitle"),
          text: i18n.global.t("app.treatmentPlans.deleteConfirmText"),
          primaryLabel: i18n.global.t("app.treatmentPlans.delete"),
          secondaryLabel: i18n.global.t("app.common.cancel"),
        });
      }
      return h(FormRenderer, {
        modelValue: true,
        fields,
        initialData: { id: "p1", first_name: "Maria", last_name: "Diaz", email: "maria.diaz@example.com" },
        titleKey: "app.patients.form.title",
        editTitleKey: "app.patients.form.editTitle",
        submitLabelKey: "app.patients.form.submit",
        editSubmitLabelKey: "app.patients.form.editSubmit",
        avatarEntityType: "patient",
      });
    };
  },
});

// vite.config.ts's bootSplashPlugin injects the static splash into every
// served HTML page, this one included — main.ts's boot flow is what normally
// dismisses it, and that flow isn't part of this harness.
document.getElementById("boot-splash")?.remove();
createApp(Harness).use(createPinia()).use(vuetify).use(i18n).mount("#app");
