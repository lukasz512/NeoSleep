import { ref } from "vue";
import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";
import { useI18n } from "vue-i18n";

/** Matches apps/api/src/db/endoIntake.ts's ENDO_INTAKE_CHECKLIST_COLUMNS. View-local composable (single-view usage, no cross-view sharing) — not a Pinia store. */
export interface EndoIntakeFields {
  has_anemia: boolean | null;
  has_diabetes: boolean | null;
  has_smoking: boolean | null;
  has_endocrine_disorder: boolean | null;
  has_sinusitis: boolean | null;
  has_alcoholism: boolean | null;
  has_hypertension: boolean | null;
  has_hepatitis: boolean | null;
  has_cancer: boolean | null;
  has_addictions: boolean | null;
  has_heart_disease: boolean | null;
  has_kidney_disease: boolean | null;
  has_hiv: boolean | null;
  has_neurological_disorder: boolean | null;
  medical_history_other: string | null;
  has_bruxism: boolean | null;
  has_narrow_palate: boolean | null;
  has_geographic_tongue: boolean | null;
  has_xerostomia: boolean | null;
  skeletal_class: "I" | "II" | "III" | null;
  is_mouth_breather: boolean | null;
  has_missing_teeth: boolean | null;
  has_periodontal_disease: boolean | null;
  has_tmj_finding: boolean | null;
}

const EMPTY_FIELDS: EndoIntakeFields = {
  has_anemia: null,
  has_diabetes: null,
  has_smoking: null,
  has_endocrine_disorder: null,
  has_sinusitis: null,
  has_alcoholism: null,
  has_hypertension: null,
  has_hepatitis: null,
  has_cancer: null,
  has_addictions: null,
  has_heart_disease: null,
  has_kidney_disease: null,
  has_hiv: null,
  has_neurological_disorder: null,
  medical_history_other: null,
  has_bruxism: null,
  has_narrow_palate: null,
  has_geographic_tongue: null,
  has_xerostomia: null,
  skeletal_class: null,
  is_mouth_breather: null,
  has_missing_teeth: null,
  has_periodontal_disease: null,
  has_tmj_finding: null,
};

export function useEndoIntake(patientId: string) {
  const { t } = useI18n();
  const notifications = useNotifications();

  const loading = ref(true);
  const saving = ref(false);
  const generatingPdf = ref(false);
  const fields = ref<EndoIntakeFields>({ ...EMPTY_FIELDS });

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId}/endo-intake`, { handleErrors: false });
      if (res.ok) {
        const data = (await res.json()) as (EndoIntakeFields & Record<string, unknown>) | null;
        if (data) fields.value = { ...EMPTY_FIELDS, ...data };
      } else {
        notifications.show(t("app.patients.endoIntake.errorLoad"), "error");
      }
    } catch {
      notifications.show(t("app.patients.endoIntake.errorLoad"), "error");
    } finally {
      loading.value = false;
    }
  }

  async function save(): Promise<void> {
    if (saving.value) return;
    saving.value = true;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId}/endo-intake`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields.value),
      });
      if (res.ok) {
        const data = (await res.json()) as EndoIntakeFields;
        fields.value = { ...EMPTY_FIELDS, ...data };
        notifications.show(t("app.patients.endoIntake.saveSuccess"), "success");
      } else {
        notifications.show(t("app.patients.endoIntake.saveError"), "error");
      }
    } catch {
      notifications.show(t("app.patients.endoIntake.saveError"), "error");
    } finally {
      saving.value = false;
    }
  }

  async function generatePdf(): Promise<void> {
    if (generatingPdf.value) return;
    generatingPdf.value = true;
    try {
      const res = await apiFetch(`/api/v1/patient/${patientId}/endo-intake/generate-pdf`, { method: "POST" });
      if (res.ok) {
        notifications.show(t("app.patients.endoIntake.generatePdfSuccess"), "success");
      } else {
        notifications.show(t("app.patients.endoIntake.generatePdfError"), "error");
      }
    } catch {
      notifications.show(t("app.patients.endoIntake.generatePdfError"), "error");
    } finally {
      generatingPdf.value = false;
    }
  }

  return { loading, saving, generatingPdf, fields, load, save, generatePdf };
}
