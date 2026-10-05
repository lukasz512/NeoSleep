<template>
  <section class="sync-card" data-testid="lab-order-sync-card">
    <header class="sync-card__head">
      <div class="sync-card__title-block">
        <h2 class="sync-card__title">{{ t("app.labOrderSync.title") }}</h2>
        <p class="sync-card__when" data-testid="sync-when">
          <template v-if="lastRun">
            {{ t("app.labOrderSync.lastRun", { when: formatWhen(lastRun.startedAt) }) }}
            · {{ t(`app.labOrderSync.trigger.${lastRun.trigger}`) }}
          </template>
          <template v-else>{{ t("app.labOrderSync.never") }}</template>
        </p>
      </div>
      <VBtn
        color="primary"
        variant="flat"
        :loading="running"
        :disabled="loading"
        data-testid="sync-check-now"
        @click="checkNow"
      >
        {{ t("app.labOrderSync.checkNow") }}
      </VBtn>
    </header>

    <AppInlineAlert v-if="loadError" type="error" :text="t('app.labOrderSync.loadError')" />
    <AppInlineAlert v-else-if="checkError" type="error" :text="t('app.labOrderSync.checkError')" data-testid="sync-check-error" />

    <template v-if="lastRun">
      <dl class="sync-card__counts" data-testid="sync-counts">
        <div><dt>{{ t("app.labOrderSync.count.checked") }}</dt><dd>{{ lastRun.checked ?? "—" }}</dd></div>
        <div><dt>{{ t("app.labOrderSync.count.changed") }}</dt><dd>{{ lastRun.changed ?? "—" }}</dd></div>
        <div><dt>{{ t("app.labOrderSync.count.failed") }}</dt><dd>{{ lastRun.failed ?? "—" }}</dd></div>
      </dl>
      <AppInlineAlert
        v-if="lastRun.error"
        type="error"
        :text="t('app.labOrderSync.runError', { error: lastRun.error })"
        data-testid="sync-run-error"
      />
    </template>

    <div v-if="runs.length > 1" class="sync-card__block">
      <h3 class="sync-card__subtitle">{{ t("app.labOrderSync.recentTitle") }}</h3>
      <ul class="sync-card__runs" data-testid="sync-runs">
        <li v-for="run in recentRuns" :key="run.id" class="sync-card__run">
          <span class="sync-card__run-when">{{ formatWhen(run.startedAt) }}</span>
          <span>{{ t(`app.labOrderSync.trigger.${run.trigger}`) }}</span>
          <span v-if="run.error" class="sync-card__run-error">{{ t("app.labOrderSync.runFailed") }}</span>
          <span v-else-if="run.checked !== null">
            {{ t("app.labOrderSync.runSummary", { checked: run.checked, changed: run.changed ?? 0, failed: run.failed ?? 0 }) }}
          </span>
          <span v-else>{{ t("app.labOrderSync.runUnfinished") }}</span>
        </li>
      </ul>
    </div>

    <div class="sync-card__block">
      <h3 class="sync-card__subtitle">{{ t("app.labOrderSync.openTitle") }}</h3>
      <div v-if="openOrders.length > 0" class="sync-card__table-wrap">
        <VTable density="compact" class="sync-card__table" data-testid="sync-open-orders">
          <thead>
            <tr>
              <th>{{ t("app.labOrderSync.col.patient") }}</th>
              <th>{{ t("app.labOrderSync.col.order") }}</th>
              <th>{{ t("app.labOrderSync.col.status") }}</th>
              <th>{{ t("app.labOrderSync.col.lastCheck") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="order in openOrders" :key="order.treatmentPlanId">
              <td>
                <RouterLink :to="`/patients/${order.patientId}`">{{ order.patientName }}</RouterLink>
              </td>
              <td class="sync-card__num">{{ order.externalId ?? "—" }}</td>
              <td>{{ statusLabel(order.externalStatus) }}</td>
              <td>{{ order.lastSyncedAt ? formatRelative(order.lastSyncedAt) : t("app.labOrderSync.notCheckedYet") }}</td>
            </tr>
          </tbody>
        </VTable>
      </div>
      <p v-else-if="loaded" class="sync-card__empty" data-testid="sync-empty">
        {{ totalLinks === 0 ? t("app.labOrderSync.emptyNoneSent") : t("app.labOrderSync.emptyNoneOpen") }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { AppInlineAlert } from "@ui";
import { apiFetch } from "../../composables/useApi";

/**
 * Admin Dashboard card for the lab order status sync (CORE-67): when it last
 * ran and who started it, what it found, the orders it still watches, and a
 * "Check now" button. The lab is never named on screen.
 */

interface SyncRunDto {
  id: string;
  trigger: "app" | "schedule" | "manual";
  startedAt: string;
  finishedAt: string | null;
  checked: number | null;
  changed: number | null;
  failed: number | null;
  error: string | null;
}

interface OpenOrderDto {
  treatmentPlanId: string;
  patientId: string;
  patientName: string;
  externalId: string | null;
  externalStatus: string | null;
  lastSyncedAt: string | null;
  syncStatus: string;
}

interface SyncStatusDto {
  runs: SyncRunDto[];
  openOrders: OpenOrderDto[];
  totalLinks: number;
}

/** Runs listed under the headline run. */
const RECENT_RUNS_SHOWN = 4;

const { t, te, locale } = useI18n();
const runs = ref<SyncRunDto[]>([]);
const openOrders = ref<OpenOrderDto[]>([]);
const totalLinks = ref(0);
const loading = ref(false);
const loaded = ref(false);
const running = ref(false);
const loadError = ref(false);
const checkError = ref(false);

const lastRun = computed<SyncRunDto | null>(() => runs.value[0] ?? null);
const recentRuns = computed(() => runs.value.slice(1, 1 + RECENT_RUNS_SHOWN));

function intlLocale(): string {
  return locale.value === "mx" ? "es-MX" : locale.value;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(intlLocale(), { dateStyle: "medium", timeStyle: "short" });
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const minutes = Math.round((then - Date.now()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

/** Readable name for a lab status code we have copy for; the code itself otherwise. */
function statusLabel(code: string | null): string {
  if (code === null) return t("app.labOrderSync.notCheckedYet");
  const key = `app.labOrderSync.status.${code}`;
  return te(key) ? t(key) : t("app.labOrderSync.statusOther", { code });
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    const res = await apiFetch("/api/v1/partners/orthoapnea/sync-status", { handleErrors: false });
    if (res.ok) {
      const body = (await res.json()) as SyncStatusDto;
      runs.value = body.runs;
      openOrders.value = body.openOrders;
      totalLinks.value = body.totalLinks;
      loaded.value = true;
    } else loadError.value = true;
  } catch {
    // benign: shown as the inline load error; the next "Check now" or visit retries.
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function checkNow(): Promise<void> {
  running.value = true;
  checkError.value = false;
  try {
    const res = await apiFetch("/api/v1/partners/orthoapnea/sync-statuses/now", { method: "POST", handleErrors: false });
    if (!res.ok) checkError.value = true;
  } catch {
    // benign: shown as the inline check error; the admin can press "Check now" again.
    checkError.value = true;
  } finally {
    // Reload either way: a failed run is recorded and shows in the list.
    await load();
    running.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.sync-card {
  max-width: 720px;
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
}

.sync-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.sync-card__title-block {
  flex: 1 1 240px;
  min-width: 0;
}

.sync-card__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.sync-card__when {
  margin: 4px 0 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
}

.sync-card__counts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 12px;
  margin: 0;
}

.sync-card__counts dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.8125rem;
}

.sync-card__counts dd {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.sync-card__block {
  display: grid;
  gap: 8px;
}

.sync-card__subtitle {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.sync-card__runs {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.sync-card__run {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.sync-card__run-when {
  font-variant-numeric: tabular-nums;
}

.sync-card__run-error {
  color: rgb(var(--v-theme-error));
}

.sync-card__table :deep(td),
.sync-card__table :deep(th) {
  white-space: nowrap;
}

/* On a phone each order is two lines (patient · order number, then status · last check)
   instead of a table wider than the card. */
@media (max-width: 599px) {
  .sync-card__table :deep(thead) {
    display: none;
  }
  .sync-card__table :deep(tbody tr) {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    padding: 8px 0;
    border-bottom: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .sync-card__table :deep(tbody td) {
    height: auto !important;
    padding: 0 !important;
    border-bottom: none !important;
  }
  .sync-card__table :deep(tbody td:nth-child(even)) {
    text-align: end;
  }
  .sync-card__table :deep(tbody td:nth-child(n + 3)) {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.8125rem;
  }
}

.sync-card__num {
  font-variant-numeric: tabular-nums;
}

.sync-card__empty {
  margin: 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
