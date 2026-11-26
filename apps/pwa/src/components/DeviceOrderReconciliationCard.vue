<template>
  <section class="dor-card" :class="[`dor-card--${view.state}`, `dor-card--${mode}`]" data-testid="device-order-reconciliation">
    <header class="dor-card__head">
      <div class="dor-card__title-block">
        <h2 class="dor-card__title">{{ t("app.deviceOrderReconciliation.title") }}</h2>
        <p class="dor-card__when" data-testid="dor-when">
          <template v-if="view.finishedAt">
            {{ t("app.deviceOrderReconciliation.lastCheck", { when: formatWhen(view.finishedAt) }) }}
            <template v-if="view.trigger"> · {{ t(`app.deviceOrderReconciliation.trigger.${view.trigger}`) }}</template>
          </template>
          <template v-else>{{ t("app.deviceOrderReconciliation.never") }}</template>
        </p>
      </div>
      <div class="dor-card__level">
        <VChip :color="stateColor" variant="tonal" size="small" data-testid="dor-state">
          {{ t(`app.deviceOrderReconciliation.state.${view.state}`) }}
        </VChip>
        <span v-if="view.percent !== null" class="dor-card__percent" data-testid="dor-percent">{{ view.percent }}&nbsp;%</span>
      </div>
      <VBtn
        v-if="mode === 'full'"
        class="dor-card__check"
        color="primary"
        variant="flat"
        :loading="running"
        :disabled="loading"
        data-testid="dor-check-now"
        @click="checkNow"
      >
        {{ t("app.deviceOrderReconciliation.checkNow") }}
      </VBtn>
    </header>

    <AppInlineAlert v-if="loadError" type="error" :text="t('app.deviceOrderReconciliation.loadError')" />
    <AppInlineAlert v-else-if="view.state === 'failed'" type="error" :text="t('app.deviceOrderReconciliation.failed')" data-testid="dor-failed" />

    <dl v-if="view.counts" class="dor-card__counts" data-testid="dor-counts">
      <div><dt>{{ t("app.deviceOrderReconciliation.count.oursSent") }}</dt><dd>{{ view.counts.oursSent }}</dd></div>
      <div><dt>{{ t("app.deviceOrderReconciliation.count.labTotal") }}</dt><dd>{{ view.counts.labTotal }}</dd></div>
      <div><dt>{{ t("app.deviceOrderReconciliation.count.matched") }}</dt><dd>{{ view.counts.matched }}</dd></div>
      <div><dt>{{ t("app.deviceOrderReconciliation.count.mismatches") }}</dt><dd>{{ view.counts.mismatches }}</dd></div>
    </dl>

    <template v-if="mode === 'full'">
      <div v-if="view.attention.length > 0" class="dor-card__table-wrap">
        <h3 class="dor-card__subtitle">{{ t("app.deviceOrderReconciliation.attentionTitle") }}</h3>
        <VTable density="compact" class="dor-card__table" data-testid="dor-attention">
          <thead>
            <tr>
              <th>{{ t("app.deviceOrderReconciliation.col.order") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.patient") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.reason") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.differences") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in view.attention" :key="`${row.reason}-${row.externalId ?? row.treatmentPlanId}`">
              <td class="dor-card__num">{{ row.externalId ?? "—" }}</td>
              <td>
                <RouterLink v-if="row.patientId" :to="`/patients/${row.patientId}`">{{ row.patientName || t("app.deviceOrderReconciliation.openPatient") }}</RouterLink>
                <span v-else>{{ row.patientName || "—" }}</span>
              </td>
              <td>{{ t(`app.deviceOrderReconciliation.reason.${row.reason}`) }}</td>
              <td>
                <ul v-if="row.drift.length > 0" class="dor-card__drift">
                  <li v-for="d in row.drift" :key="d.field">
                    <span class="dor-card__field">{{ fieldLabel(d.field) }}</span>
                    {{ d.ours || "—" }} → {{ d.lab || "—" }}
                  </li>
                </ul>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </VTable>
      </div>
      <p v-else-if="view.state === 'ok'" class="dor-card__all-good" data-testid="dor-all-good">
        {{ t("app.deviceOrderReconciliation.allGood") }}
      </p>

      <div v-if="view.explained.length > 0" class="dor-card__table-wrap">
        <h3 class="dor-card__subtitle">{{ t("app.deviceOrderReconciliation.explainedTitle") }}</h3>
        <VTable density="compact" class="dor-card__table dor-card__table--muted" data-testid="dor-explained">
          <thead>
            <tr>
              <th>{{ t("app.deviceOrderReconciliation.col.order") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.patient") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.reason") }}</th>
              <th>{{ t("app.deviceOrderReconciliation.col.requested") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in view.explained" :key="`${row.reason}-${row.externalId}`">
              <td class="dor-card__num">{{ row.externalId ?? "—" }}</td>
              <td>{{ row.patientName || "—" }}</td>
              <td>{{ t(`app.deviceOrderReconciliation.reason.${row.reason}`) }}</td>
              <td class="dor-card__num">{{ row.requestDate ? row.requestDate.slice(0, 10) : "—" }}</td>
            </tr>
          </tbody>
        </VTable>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { AppInlineAlert } from "@ui";
import { apiFetch } from "../composables/useApi";
import { reconciliationView, type LatestReconciliationDto } from "../utils/deviceOrderReconciliation";

/**
 * Do our device orders match the lab's? (NEO-218) — `full` for admins (the
 * dashboard: counts, the orders that need a look, "Check now"), `counter` for
 * managers (state + match level only; the API sends them nothing more).
 * The lab is never named on screen.
 */
const { mode = "full" } = defineProps<{ mode?: "full" | "counter" }>();

const { t, te, locale } = useI18n();
const latest = ref<LatestReconciliationDto | null>(null);
const loading = ref(false);
const running = ref(false);
const loadError = ref(false);

const view = computed(() => reconciliationView(latest.value));
const stateColor = computed(() => ({ never: "default", ok: "success", mismatch: "warning", failed: "error" })[view.value.state]);

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale.value === "mx" ? "es-MX" : locale.value, { dateStyle: "medium", timeStyle: "short" });
}

/** A readable label for the compared fields we have copy for; the raw path otherwise. */
function fieldLabel(path: string): string {
  const key = `app.deviceOrderReconciliation.field.${path.replace(/\./g, "_")}`;
  return te(key) ? t(key) : path;
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch("/api/v1/device-orders/reconciliation/latest", { handleErrors: false });
    if (res.ok) latest.value = (await res.json()) as LatestReconciliationDto;
    else loadError.value = true;
  } catch {
    // benign: shown as the inline load error; the next "Check now" or visit retries.
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function checkNow(): Promise<void> {
  running.value = true;
  try {
    const res = await apiFetch("/api/v1/device-orders/reconciliation/run", { method: "POST", handleErrors: false });
    if (!res.ok) {
      loadError.value = true;
      return;
    }
    await load();
  } catch {
    // benign: shown as the inline load error; the admin can press "Check now" again.
    loadError.value = true;
  } finally {
    running.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.dor-card {
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: rgb(var(--v-theme-surface));
}

/* Manager's counter: one quiet line above a list, so it doesn't push the table's pagination off screen. */
.dor-card--counter {
  padding: 0 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.dor-card--counter .dor-card__title {
  font-size: 0.9375rem;
}

.dor-card--counter .dor-card__percent {
  font-size: 1rem;
}

.dor-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.dor-card__title-block {
  flex: 1 1 240px;
  min-width: 0;
}

.dor-card__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.dor-card__when {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

.dor-card__level {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dor-card__percent {
  font-size: 1.5rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dor-card__counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin: 0;
}

.dor-card__counts dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.dor-card__counts dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dor-card__subtitle {
  margin: 0 0 8px;
  font-size: 0.9375rem;
  font-weight: 600;
}

/* On a phone the table scrolls sideways inside the card instead of wrapping every word. */
.dor-card__table-wrap {
  overflow-x: auto;
}

.dor-card__table :deep(table) {
  min-width: 600px;
}

.dor-card__table :deep(td),
.dor-card__table :deep(th) {
  white-space: nowrap;
}

.dor-card__table--muted {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dor-card__num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dor-card__drift {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dor-card__field {
  font-weight: 600;
  margin-right: 4px;
}

.dor-card__all-good {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
