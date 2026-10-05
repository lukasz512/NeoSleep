<template>
  <button type="button" class="tmj-card" data-testid="tmj-card" :aria-label="t('app.clinical.tmj.cardOpen')" @click="emit('open')">
    <span class="tmj-card__head">
      <span class="tmj-card__title">{{ t("app.clinical.tmj.cardTitle") }}</span>
      <span v-if="latest" class="tmj-card__date">{{ formatDate(latest.created_at) }}</span>
    </span>
    <span class="tmj-card__body">
      <TmjSkull class="tmj-card__skull" :counts="counts" mini look="pencil" />
      <dl v-if="latest" class="tmj-card__facts">
        <div>
          <dt>{{ t("app.clinical.tmj.right") }}</dt>
          <dd>{{ t("app.clinical.tmj.findings", { n: counts.right }, counts.right) }}</dd>
        </div>
        <div>
          <dt>{{ t("app.clinical.tmj.left") }}</dt>
          <dd>{{ t("app.clinical.tmj.findings", { n: counts.left }, counts.left) }}</dd>
        </div>
        <div>
          <dt>{{ t("app.clinical.tmj.maxOpening") }}</dt>
          <dd>{{ latest.max_opening_mm != null ? t("app.clinical.tmj.mm", { mm: latest.max_opening_mm }) : "—" }}</dd>
        </div>
      </dl>
      <span v-else class="tmj-card__empty">{{ t("app.clinical.tmj.cardEmpty") }}</span>
    </span>
    <span class="tmj-card__open">{{ t("app.clinical.tmj.cardOpen") }} →</span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { reportCaught, reportFailedResponse } from "@api";
import { intlLocale } from "@i18n/language-options";
import TmjSkull from "../questionnaire/TmjSkull.vue";
import { apiFetch } from "../../composables/useApi";
import { tmjSideCounts } from "../../config/questionnaires";
import { onPatientChecklistUpdated } from "../../composables/usePatientChecklist";

/**
 * The patient's latest ATM evaluation on Detalles → Clínico (NEO-237 D1):
 * a mini sketch skull lit per side by the number of findings, the findings
 * per side and the maximum opening. Read-only; a click opens the ATM tab of
 * the Historia clínica. Health data — the parent renders it only for roles
 * that may see studies.
 */
interface TmjRecord {
  kind: string;
  created_at: string;
  max_opening_mm?: number | null;
  [finding: string]: unknown;
}

const props = defineProps<{ patientId: string }>();
const emit = defineEmits<{ open: [] }>();
const { t, locale } = useI18n();

const latest = ref<TmjRecord | null>(null);
const counts = computed(() => (latest.value ? tmjSideCounts(latest.value) : { right: 0, left: 0 }));

async function load(): Promise<void> {
  const id = props.patientId;
  try {
    const res = await apiFetch(`/api/v1/patient/${id}/clinical-records`, { handleErrors: false });
    if (id !== props.patientId) return;
    if (!res.ok) {
      await reportFailedResponse(res, { where: "PatientTmjCard.load", path: "/api/v1/patient/:id/clinical-records" });
      return;
    }
    const { records } = (await res.json()) as { records: TmjRecord[] };
    latest.value =
      records
        .filter((r) => r.kind === "tmj_exam")
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  } catch (err) {
    reportCaught(err, { where: "PatientTmjCard.load" });
  }
}
onMounted(load);
// A saved ATM evaluation shows here without a reload (NEO-240).
onPatientChecklistUpdated(() => props.patientId, () => void load());
watch(
  () => props.patientId,
  () => {
    latest.value = null;
    void load();
  }
);

const formatDate = (value: string) => new Date(value).toLocaleDateString(intlLocale(locale.value), { day: "2-digit", month: "2-digit", year: "numeric" });
</script>

<style scoped>
.tmj-card {
  width: 100%;
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(var(--v-theme-surface), 0.85), rgba(var(--v-theme-primary), 0.05));
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}
.tmj-card:hover {
  box-shadow: 0 6px 18px rgba(var(--v-theme-primary), 0.12);
}
.tmj-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.tmj-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.tmj-card__title {
  font-weight: 600;
  font-size: 0.875rem;
}
.tmj-card__date {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.tmj-card__body {
  display: flex;
  align-items: center;
  gap: 14px;
}
.tmj-card__skull {
  width: 88px;
  flex: none;
}
.tmj-card__facts {
  margin: 0;
  display: grid;
  gap: 4px;
  font-size: 0.8125rem;
}
.tmj-card__facts dt {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.tmj-card__facts dd {
  margin: 0;
  font-weight: 600;
}
.tmj-card__empty {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.tmj-card__open {
  font-size: 0.8125rem;
  color: rgb(var(--v-theme-primary));
}
@media (prefers-reduced-motion: reduce) {
  .tmj-card {
    transition: none;
  }
}
</style>
