<template>
  <AppLoadingState v-if="loading" />
  <div v-else class="endo-intake">
    <section class="endo-intake__section">
      <h3 class="endo-intake__section-title">{{ t("app.patients.endoIntake.sectionMedicalHistory") }}</h3>
      <div v-for="q in medicalHistoryQuestions" :key="q.key" class="endo-intake__row">
        <span class="endo-intake__label">{{ t(q.labelKey) }}</span>
        <VBtnToggle v-model="fields[q.key]" density="comfortable" color="primary" divided>
          <VBtn :value="true" size="small">{{ t("app.common.yes") }}</VBtn>
          <VBtn :value="false" size="small">{{ t("app.common.no") }}</VBtn>
        </VBtnToggle>
      </div>
      <VTextField
        v-model="fields.medical_history_other"
        :label="t('app.patients.endoIntake.otherLabel')"
        variant="outlined"
        density="comfortable"
        class="endo-intake__other-field"
      />
    </section>

    <section class="endo-intake__section">
      <h3 class="endo-intake__section-title">{{ t("app.patients.endoIntake.sectionOralExam") }}</h3>
      <div v-for="q in oralExamQuestions" :key="q.key" class="endo-intake__row">
        <span class="endo-intake__label">{{ t(q.labelKey) }}</span>
        <VBtnToggle v-model="fields[q.key]" density="comfortable" color="primary" divided>
          <VBtn :value="true" size="small">{{ t("app.common.yes") }}</VBtn>
          <VBtn :value="false" size="small">{{ t("app.common.no") }}</VBtn>
        </VBtnToggle>
      </div>
      <div class="endo-intake__row">
        <span class="endo-intake__label">{{ t("app.patients.endoIntake.skeletalClassLabel") }}</span>
        <VBtnToggle v-model="fields.skeletal_class" density="comfortable" color="primary" divided>
          <VBtn value="I" size="small">I</VBtn>
          <VBtn value="II" size="small">II</VBtn>
          <VBtn value="III" size="small">III</VBtn>
        </VBtnToggle>
      </div>
    </section>

    <div class="endo-intake__actions">
      <AppButton color="primary" :loading="saving" @click="save">
        {{ t("app.patients.endoIntake.save") }}
      </AppButton>
      <AppButton variant="outlined" :loading="generatingPdf" @click="generatePdf">
        {{ t("app.patients.endoIntake.generatePdf") }}
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Historia Endo intake checklist — two hardcoded yes/no sections (v1, per
 * docs/ADR-022-endo-intake-and-stop-bang-schema.md's "hardcoded for v1"
 * decision) plus a skeletal-class 3-way toggle. No existing "grouped
 * yes/no checklist" component fit (FormRenderer.vue has no section
 * support and is a modal-edit pattern) — this is the bespoke layout that
 * gap called for. VBtnToggle deliberately has no `mandatory` — an
 * unanswered question stays `null` (matches the DB's nullable BOOLEAN
 * columns), not forced to a default true/false.
 */
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { VBtnToggle, VBtn, VTextField } from "vuetify/components";
import AppButton from "../AppButton.vue";
import AppLoadingState from "../AppLoadingState.vue";
import { useEndoIntake, type EndoIntakeFields } from "../../composables/useEndoIntake";

const props = defineProps<{ patientId: string }>();

const { t } = useI18n();
const { loading, saving, generatingPdf, fields, load, save, generatePdf } = useEndoIntake(props.patientId);

const medicalHistoryQuestions: { key: keyof EndoIntakeFields; labelKey: string }[] = [
  { key: "has_anemia", labelKey: "app.patients.endoIntake.q.anemia" },
  { key: "has_diabetes", labelKey: "app.patients.endoIntake.q.diabetes" },
  { key: "has_smoking", labelKey: "app.patients.endoIntake.q.smoking" },
  { key: "has_endocrine_disorder", labelKey: "app.patients.endoIntake.q.endocrineDisorder" },
  { key: "has_sinusitis", labelKey: "app.patients.endoIntake.q.sinusitis" },
  { key: "has_alcoholism", labelKey: "app.patients.endoIntake.q.alcoholism" },
  { key: "has_hypertension", labelKey: "app.patients.endoIntake.q.hypertension" },
  { key: "has_hepatitis", labelKey: "app.patients.endoIntake.q.hepatitis" },
  { key: "has_cancer", labelKey: "app.patients.endoIntake.q.cancer" },
  { key: "has_addictions", labelKey: "app.patients.endoIntake.q.addictions" },
  { key: "has_heart_disease", labelKey: "app.patients.endoIntake.q.heartDisease" },
  { key: "has_kidney_disease", labelKey: "app.patients.endoIntake.q.kidneyDisease" },
  { key: "has_hiv", labelKey: "app.patients.endoIntake.q.hiv" },
  { key: "has_neurological_disorder", labelKey: "app.patients.endoIntake.q.neurologicalDisorder" },
];

const oralExamQuestions: { key: keyof EndoIntakeFields; labelKey: string }[] = [
  { key: "has_bruxism", labelKey: "app.patients.endoIntake.q.bruxism" },
  { key: "has_narrow_palate", labelKey: "app.patients.endoIntake.q.narrowPalate" },
  { key: "has_geographic_tongue", labelKey: "app.patients.endoIntake.q.geographicTongue" },
  { key: "has_xerostomia", labelKey: "app.patients.endoIntake.q.xerostomia" },
  { key: "is_mouth_breather", labelKey: "app.patients.endoIntake.q.mouthBreather" },
  { key: "has_missing_teeth", labelKey: "app.patients.endoIntake.q.missingTeeth" },
  { key: "has_periodontal_disease", labelKey: "app.patients.endoIntake.q.periodontalDisease" },
  { key: "has_tmj_finding", labelKey: "app.patients.endoIntake.q.tmjFinding" },
];

onMounted(load);
</script>

<style scoped>
.endo-intake__section {
  margin-bottom: 20px;
}
.endo-intake__section-title {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0 0 10px;
}
.endo-intake__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.endo-intake__label {
  flex: 1;
}
.endo-intake__other-field {
  margin-top: 12px;
  max-width: 420px;
}
.endo-intake__actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
</style>
