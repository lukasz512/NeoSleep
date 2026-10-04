<template>
  <section class="doctor-panel" data-testid="doctor-panel" :aria-label="t('app.doctorPanel.label')">
    <header class="doctor-panel__top">
      <div class="doctor-panel__hello">
        <h1 class="doctor-panel__greeting" data-testid="doctor-panel-greeting">{{ greeting }}</h1>
        <p class="doctor-panel__date">
          {{ todayLabel }}<template v-if="summary"> · {{ t("app.doctorPanel.activePatients", { count: activeTotal }) }}</template>
        </p>
      </div>
      <div class="doctor-panel__search">
        <VTextField
          v-model="search"
          :placeholder="t('app.doctorPanel.search.placeholder')"
          prepend-inner-icon="mdi-magnify"
          density="comfortable"
          variant="solo-filled"
          flat
          hide-details
          clearable
          autocomplete="off"
          data-testid="doctor-panel-search"
        />
        <div v-if="search.trim().length >= MIN_SEARCH" class="doctor-panel__results" data-testid="doctor-panel-search-results">
          <RouterLink
            v-for="hit in hits"
            :key="hit.id"
            :to="{ name: 'patient-detail', params: { id: hit.id } }"
            class="doctor-panel__row"
            data-testid="doctor-panel-search-hit"
          >
            <span class="doctor-panel__name">{{ hit.name }}</span>
          </RouterLink>
          <p v-if="searched && !hits.length" class="doctor-panel__empty">{{ t("app.doctorPanel.search.empty") }}</p>
        </div>
      </div>
    </header>

    <div class="doctor-panel__kpis">
      <RouterLink :to="{ name: 'calendar' }" class="doctor-panel__kpi doctor-panel__kpi--primary" data-testid="doctor-panel-kpi-visits">
        <span class="doctor-panel__kpi-label">{{ t("app.doctorPanel.kpi.visitsToday") }}</span>
        <b class="doctor-panel__kpi-value">{{ todayVisits.length }}</b>
        <small class="doctor-panel__kpi-sub">{{ visitsSub }}</small>
      </RouterLink>
      <a href="#doctor-panel-actions" class="doctor-panel__kpi doctor-panel__kpi--error" data-testid="doctor-panel-kpi-interpret" @click.prevent="scrollTo('doctor-panel-actions')">
        <span class="doctor-panel__kpi-label">{{ t("app.doctorPanel.kpi.toInterpret") }}</span>
        <b class="doctor-panel__kpi-value">{{ toInterpret.length }}</b>
        <small class="doctor-panel__kpi-sub">{{ interpretSub }}</small>
      </a>
      <a href="#doctor-panel-incomplete" class="doctor-panel__kpi doctor-panel__kpi--warning" data-testid="doctor-panel-kpi-incomplete" @click.prevent="scrollTo('doctor-panel-incomplete')">
        <span class="doctor-panel__kpi-label">{{ t("app.doctorPanel.kpi.incomplete") }}</span>
        <b class="doctor-panel__kpi-value">{{ incomplete.length }}</b>
        <small class="doctor-panel__kpi-sub">{{ t("app.doctorPanel.kpi.incompleteSub") }}</small>
      </a>
      <RouterLink :to="{ name: 'treatment-plans' }" class="doctor-panel__kpi doctor-panel__kpi--success" data-testid="doctor-panel-kpi-treatment">
        <span class="doctor-panel__kpi-label">{{ t("app.doctorPanel.kpi.inTreatment") }}</span>
        <b class="doctor-panel__kpi-value">{{ summary?.stages.treatment ?? 0 }}</b>
        <small class="doctor-panel__kpi-sub">{{ t("app.doctorPanel.kpi.inTreatmentSub", { count: activeTotal }) }}</small>
      </RouterLink>
    </div>

    <div class="doctor-panel__grid">
      <article class="doctor-panel__tile" data-testid="doctor-panel-today">
        <header class="doctor-panel__head">
          <h2 class="doctor-panel__title">{{ t("app.doctorPanel.today.title") }}</h2>
          <span class="doctor-panel__count" data-testid="doctor-panel-today-count">{{ visits.length }}</span>
        </header>
        <p v-if="!visits.length" class="doctor-panel__empty" data-testid="doctor-panel-today-empty">{{ t("app.doctorPanel.today.empty") }}</p>
        <template v-for="day in visitDays" v-else :key="day.key">
          <h3 class="doctor-panel__day" data-testid="doctor-panel-day">{{ t(`app.doctorPanel.today.day.${day.key}`) }}</h3>
          <RouterLink
            v-for="visit in day.visits"
            :key="visit.id"
            :to="{ name: 'patient-detail', params: { id: visit.patient_id } }"
            class="doctor-panel__row"
            :class="{ 'doctor-panel__row--now': visit.id === nextVisitId }"
            data-testid="doctor-panel-visit"
          >
            <span class="doctor-panel__time">{{ timeOf(visit.start_at) }}</span>
            <span class="doctor-panel__main">
              <span class="doctor-panel__name">{{ visit.patient_name }}</span>
              <span v-if="visit.organization_name" class="doctor-panel__meta">{{ visit.organization_name }}</span>
            </span>
            <span v-if="responseOf(visit)" class="doctor-panel__response" :class="`doctor-panel__response--${responseOf(visit)}`">
              {{ t(`user.appointments.patientResponse.${responseOf(visit)}`) }}
            </span>
          </RouterLink>
        </template>
        <RouterLink :to="{ name: 'calendar' }" class="doctor-panel__link">{{ t("app.doctorPanel.today.calendar") }}</RouterLink>
      </article>

      <article id="doctor-panel-actions" class="doctor-panel__tile" data-testid="doctor-panel-actions">
        <header class="doctor-panel__head">
          <h2 class="doctor-panel__title">{{ t("app.doctorPanel.actions.title") }}</h2>
          <span class="doctor-panel__count" :class="{ 'doctor-panel__count--due': actions.length }" data-testid="doctor-panel-actions-count">
            {{ actions.length }}
          </span>
        </header>
        <p v-if="!actions.length" class="doctor-panel__empty" data-testid="doctor-panel-actions-empty">{{ t("app.doctorPanel.actions.empty") }}</p>
        <div v-for="group in actionGroups" :key="group.kind" class="doctor-panel__group" data-testid="doctor-panel-action-group">
          <div class="doctor-panel__group-head">
            <span class="doctor-panel__dot" :class="`doctor-panel__dot--${group.kind}`" aria-hidden="true" />
            <span class="doctor-panel__group-label">{{ t(`app.doctorPanel.actions.kind.${group.kind}`) }}</span>
            <b class="doctor-panel__group-count">{{ group.items.length }}</b>
          </div>
          <div class="doctor-panel__names">
            <RouterLink
              v-for="action in shownOf(group)"
              :key="`${action.patient_id}:${action.ref_id}`"
              :to="{ name: 'patient-detail', params: { id: action.patient_id } }"
              class="doctor-panel__chip"
              data-testid="doctor-panel-action"
            >
              {{ action.patient_name }}
            </RouterLink>
            <button
              v-if="group.items.length > GROUP_PREVIEW && !openGroups.has(group.kind)"
              type="button"
              class="doctor-panel__chip doctor-panel__chip--more"
              data-testid="doctor-panel-action-more"
              @click="openGroups.add(group.kind)"
            >
              {{ t("app.doctorPanel.actions.more", { count: group.items.length - GROUP_PREVIEW }) }}
            </button>
          </div>
        </div>
      </article>

      <article id="doctor-panel-incomplete" class="doctor-panel__tile" data-testid="doctor-panel-incomplete">
        <header class="doctor-panel__head">
          <h2 class="doctor-panel__title">{{ t("app.doctorPanel.incomplete.title") }}</h2>
          <span class="doctor-panel__count" :class="{ 'doctor-panel__count--warn': incomplete.length }">{{ incomplete.length }}</span>
        </header>
        <p v-if="!incomplete.length" class="doctor-panel__empty" data-testid="doctor-panel-incomplete-empty">{{ t("app.doctorPanel.incomplete.empty") }}</p>
        <RouterLink
          v-for="row in shownIncomplete"
          :key="row.patient_id"
          :to="{ name: 'patient-detail', params: { id: row.patient_id } }"
          class="doctor-panel__row"
          data-testid="doctor-panel-incomplete-row"
        >
          <span class="doctor-panel__main">
            <span class="doctor-panel__name">{{ row.patient_name }}</span>
            <span class="doctor-panel__meta">{{ t("app.doctorPanel.incomplete.missing", { items: missingLabel(row.missing) }) }}</span>
          </span>
          <span
            class="doctor-panel__meter"
            role="meter"
            :aria-valuenow="row.done"
            aria-valuemin="0"
            :aria-valuemax="row.total"
            :aria-label="`${row.done}/${row.total}`"
          >
            <i :style="{ width: `${(row.done / row.total) * 100}%` }" />
          </span>
        </RouterLink>
        <button
          v-if="incomplete.length > INCOMPLETE_PREVIEW"
          type="button"
          class="doctor-panel__link"
          data-testid="doctor-panel-incomplete-more"
          @click="showAllIncomplete = !showAllIncomplete"
        >
          {{ showAllIncomplete ? t("app.doctorPanel.actions.showLess") : t("app.doctorPanel.actions.showAll", { count: incomplete.length }) }}
        </button>
      </article>

      <article class="doctor-panel__tile" data-testid="doctor-panel-stages">
        <header class="doctor-panel__head">
          <h2 class="doctor-panel__title">{{ t("app.doctorPanel.stages.title") }}</h2>
        </header>
        <p v-if="summary && !activeTotal" class="doctor-panel__empty">{{ t("app.doctorPanel.stages.empty") }}</p>
        <DoctorPanelDonut
          v-else
          :slices="stageSlices"
          :drawn="donutDrawn"
          :caption="t('app.doctorPanel.stages.caption')"
          :aria-label="t('app.doctorPanel.stages.aria', { count: activeTotal })"
        />
        <RouterLink :to="{ name: 'patients' }" class="doctor-panel__link">{{ t("app.doctorPanel.stages.all") }}</RouterLink>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteLeave } from "vue-router";
import { apiFetch } from "../../composables/useApi";
import { appointmentResponseState, type Appointment, type AppointmentResponseState } from "../../composables/useAppointments";
import { useAuthStore } from "../../stores/auth";
import { intlLocaleFor } from "../../utils/notificationFeed";
import DoctorPanelDonut, { type DonutSlice } from "./DoctorPanelDonut.vue";

/**
 * The doctor's Panel (NEO-233 v2, docs/stories/doctor-panel-today-and-actions.md): their own start
 * screen, like the admin's. 4 indicators over 4 cards — agenda, what waits on them, incomplete
 * files and patients by stage — all from data that already exists, own patients only (CORE-104).
 */

type ActionKind = "results_to_interpret" | "cannot_attend" | "plan_not_notified" | "consent_missing";
const ACTION_KINDS: ActionKind[] = ["results_to_interpret", "cannot_attend", "plan_not_notified", "consent_missing"];

interface DoctorAction {
  kind: ActionKind;
  patient_id: string;
  patient_name: string | null;
  ref_id: string;
  at: string | null;
}

type Stage = "intake" | "study" | "results" | "plan" | "treatment";
const STAGES: Stage[] = ["intake", "study", "results", "plan", "treatment"];
const STAGE_COLORS: Record<Stage, string> = {
  intake: "rgba(var(--v-theme-on-surface), 0.28)",
  study: "rgb(var(--v-theme-info))",
  results: "rgb(var(--v-theme-primary))",
  plan: "rgb(var(--v-theme-warning))",
  treatment: "rgb(var(--v-theme-success))",
};

interface Incomplete {
  patient_id: string;
  patient_name: string | null;
  missing: string[];
  done: number;
  total: number;
}

interface Summary {
  enabled: boolean;
  stages: Record<Stage, number>;
  incomplete: Incomplete[];
}

type Visit = Pick<Appointment, "id" | "patient_id" | "patient_name" | "organization_name" | "status" | "start_at" | "patient_response" | "confirm_request_sent_at">;

interface Hit {
  id: string;
  name: string | null;
}

/** Names shown per action group before "+N"; rows of "Por completar" before "Show all". */
const GROUP_PREVIEW = 3;
const INCOMPLETE_PREVIEW = 5;
const MIN_SEARCH = 2;
const SEARCH_DEBOUNCE_MS = 250;
/** How long the route waits for the ring to fold away — matches DoctorPanelDonut's transition. */
const LEAVE_MS = 320;
const DAY_MS = 86_400_000;

const { t, te, locale } = useI18n();
const authStore = useAuthStore();

const actions = ref<DoctorAction[]>([]);
const visits = ref<Visit[]>([]);
const summary = ref<Summary | null>(null);
const openGroups = reactive(new Set<ActionKind>());
const showAllIncomplete = ref(false);
const donutDrawn = ref(false);

const search = ref("");
const hits = ref<Hit[]>([]);
const searched = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
}

const greeting = computed(() => {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 19 ? "afternoon" : "evening";
  const name = authStore.user?.name?.trim();
  return name ? t(`app.doctorPanel.greeting.${part}`, { name }) : t(`app.doctorPanel.greeting.${part}Plain`);
});

const todayLabel = computed(() =>
  new Intl.DateTimeFormat(intlLocaleFor(locale.value), { weekday: "long", day: "numeric", month: "long" }).format(new Date())
);

const activeTotal = computed(() => (summary.value ? STAGES.reduce((sum, s) => sum + summary.value!.stages[s], 0) : 0));
const incomplete = computed(() => summary.value?.incomplete ?? []);
const shownIncomplete = computed(() => (showAllIncomplete.value ? incomplete.value : incomplete.value.slice(0, INCOMPLETE_PREVIEW)));

const todayVisits = computed(() => visits.value.filter((v) => new Date(v.start_at).getTime() < startOfDay(1).getTime()));
const visitsSub = computed(() => {
  if (!todayVisits.value.length) return t("app.doctorPanel.kpi.noVisits");
  const unconfirmed = todayVisits.value.filter((v) => responseOf(v) !== "confirmed").length;
  return unconfirmed ? t("app.doctorPanel.kpi.visitsUnconfirmed", { count: unconfirmed }) : t("app.doctorPanel.kpi.allConfirmed");
});

const toInterpret = computed(() => actions.value.filter((a) => a.kind === "results_to_interpret"));
const interpretSub = computed(() => {
  const times = toInterpret.value.map((a) => (a.at ? new Date(a.at).getTime() : Date.now()));
  if (!times.length) return t("app.doctorPanel.kpi.nothingWaiting");
  // Calendar days, as a doctor counts them: received on the 1st, seen on the 5th = 4 days.
  const oldest = new Date(Math.min(...times));
  const oldestDay = new Date(oldest.getFullYear(), oldest.getMonth(), oldest.getDate()).getTime();
  const days = Math.max(0, Math.round((startOfDay(0).getTime() - oldestDay) / DAY_MS));
  return t("app.doctorPanel.kpi.oldest", { days }, days);
});

const actionGroups = computed(() =>
  ACTION_KINDS.map((kind) => ({ kind, items: actions.value.filter((a) => a.kind === kind) })).filter((g) => g.items.length)
);

function shownOf(group: { kind: ActionKind; items: DoctorAction[] }): DoctorAction[] {
  return openGroups.has(group.kind) ? group.items : group.items.slice(0, GROUP_PREVIEW);
}

const visitDays = computed(() => {
  const tomorrow = startOfDay(1).getTime();
  const days = [
    { key: "today" as const, visits: visits.value.filter((v) => new Date(v.start_at).getTime() < tomorrow) },
    { key: "tomorrow" as const, visits: visits.value.filter((v) => new Date(v.start_at).getTime() >= tomorrow) },
  ];
  return days.filter((d) => d.visits.length);
});

/** The "now" marker: the first of today's visits that hasn't ended its start hour yet. */
const nextVisitId = computed(() => {
  const cutoff = Date.now() - 3_600_000;
  return todayVisits.value.find((v) => new Date(v.start_at).getTime() >= cutoff)?.id ?? null;
});

const stageSlices = computed<DonutSlice[]>(() =>
  STAGES.map((stage) => ({
    key: stage,
    label: t(`app.doctorPanel.stages.${stage}`),
    value: summary.value?.stages[stage] ?? 0,
    color: STAGE_COLORS[stage],
  }))
);

function missingLabel(keys: string[]): string {
  return keys
    .map((key) => {
      if (key === "phone" || key === "email") return t(`app.doctorPanel.incomplete.contact.${key}`);
      return te(`app.clinical.item.${key}`) ? t(`app.clinical.item.${key}`) : key;
    })
    .join(", ");
}

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat(intlLocaleFor(locale.value), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function responseOf(visit: Visit): AppointmentResponseState | null {
  return appointmentResponseState(visit);
}

function scrollTo(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

async function json<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  return res.ok ? ((await res.json()) as T) : null;
}

async function load(): Promise<void> {
  const params = new URLSearchParams({ start: startOfDay(0).toISOString(), end: startOfDay(2).toISOString() });
  const [actionsBody, summaryBody, visitsBody] = await Promise.all([
    json<{ enabled: boolean; items: DoctorAction[] }>("/api/v1/doctor-panel/actions"),
    json<Summary>("/api/v1/doctor-panel/summary"),
    json<{ items: Visit[] }>(`/api/v1/appointments?${params.toString()}`),
  ]);
  actions.value = actionsBody?.items ?? [];
  summary.value = summaryBody;
  visits.value = (visitsBody?.items ?? [])
    .filter((v) => v.status !== "cancelled")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  // Draw the ring after it has rendered empty, so the segments grow in.
  await nextTick();
  requestAnimationFrame(() => requestAnimationFrame(() => (donutDrawn.value = true)));
}

watch(search, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  const q = (value ?? "").trim();
  if (q.length < MIN_SEARCH) {
    hits.value = [];
    searched.value = false;
    return;
  }
  searchTimer = setTimeout(async () => {
    const body = await json<{ items: Hit[] }>(`/api/v1/patient?${new URLSearchParams({ search: q, limit: "6" }).toString()}`);
    if ((search.value ?? "").trim() !== q) return;
    hits.value = body?.items ?? [];
    searched.value = true;
  }, SEARCH_DEBOUNCE_MS);
});

// The ring folds away before the page changes (Łukasz: "animates on the way in and out").
onBeforeRouteLeave(async () => {
  if (!donutDrawn.value || prefersReducedMotion()) return true;
  donutDrawn.value = false;
  await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
  return true;
});

onMounted(() => {
  void load();
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<style scoped>
.doctor-panel {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) 0;
}

.doctor-panel__top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-3);
}

.doctor-panel__greeting {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}

.doctor-panel__date {
  margin: var(--space-1) 0 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__date::first-letter {
  text-transform: uppercase;
}

.doctor-panel__search {
  position: relative;
  flex: 0 1 320px;
  min-width: 220px;
}

.doctor-panel__results {
  position: absolute;
  z-index: 5;
  top: calc(100% + var(--space-1));
  right: 0;
  left: 0;
  display: grid;
  padding: var(--space-2);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.doctor-panel__results .doctor-panel__row {
  margin: 0;
}

.doctor-panel__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-3);
}

.doctor-panel__kpi {
  --kpi: var(--v-theme-primary);
  position: relative;
  display: grid;
  gap: 2px;
  overflow: hidden;
  padding: var(--space-3) var(--space-4);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
  color: inherit;
  text-decoration: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.doctor-panel__kpi::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: rgb(var(--kpi));
}

.doctor-panel__kpi:hover,
.doctor-panel__kpi:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.doctor-panel__kpi--error {
  --kpi: var(--v-theme-error);
}

.doctor-panel__kpi--warning {
  --kpi: var(--v-theme-warning);
}

.doctor-panel__kpi--success {
  --kpi: var(--v-theme-success);
}

.doctor-panel__kpi-label {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__kpi-value {
  font-size: 1.75rem;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}

.doctor-panel__kpi-sub {
  font-size: 0.75rem;
  color: rgb(var(--kpi));
}

/* Four cards: one column on phones, a 2 × 2 grid from tablet up so no card sits alone in a row. */
.doctor-panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}

@media (min-width: 760px) {
  .doctor-panel__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.doctor-panel__tile {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-4);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius);
  background: rgb(var(--v-theme-surface));
  scroll-margin-top: var(--space-6, 24px);
}

.doctor-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.doctor-panel__title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__count {
  min-width: 24px;
  padding: 0 var(--space-2);
  border-radius: 12px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 24px;
  text-align: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.doctor-panel__count--due {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.doctor-panel__count--warn {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.14);
}

.doctor-panel__day {
  margin: var(--space-2) 0 0;
  font-size: 0.8125rem;
  font-weight: 600;
}

.doctor-panel__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  margin: 0 calc(-1 * var(--space-2));
  padding: var(--space-1) var(--space-2);
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.doctor-panel__row:hover,
.doctor-panel__row:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.doctor-panel__row--now {
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}

.doctor-panel__time {
  flex: none;
  /* es-MX adds "a.m."/"p.m."; one line, same column width for every row. */
  min-width: 80px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.doctor-panel__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.doctor-panel__name,
.doctor-panel__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doctor-panel__meta {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__response {
  flex: none;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__response--confirmed {
  color: rgb(var(--v-theme-success));
}

.doctor-panel__response--cannot_attend {
  color: rgb(var(--v-theme-error));
}

.doctor-panel__group {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-2) 0;
}

.doctor-panel__group + .doctor-panel__group {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.doctor-panel__group-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.doctor-panel__group-label {
  flex: 1;
  font-weight: 500;
}

.doctor-panel__group-count {
  font-variant-numeric: tabular-nums;
}

.doctor-panel__names {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding-left: var(--space-4);
}

.doctor-panel__chip {
  padding: 2px var(--space-2);
  border: 0;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font: inherit;
  font-size: 0.8125rem;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}

.doctor-panel__chip:hover,
.doctor-panel__chip:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.doctor-panel__chip--more {
  color: rgb(var(--v-theme-primary));
}

.doctor-panel__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.38);
}

.doctor-panel__dot--results_to_interpret {
  background: rgb(var(--v-theme-primary));
}

.doctor-panel__dot--cannot_attend {
  background: rgb(var(--v-theme-error));
}

.doctor-panel__dot--plan_not_notified,
.doctor-panel__dot--consent_missing {
  background: rgb(var(--v-theme-warning));
}

.doctor-panel__meter {
  flex: none;
  width: 64px;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.doctor-panel__meter i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: rgb(var(--v-theme-success));
}

.doctor-panel__empty {
  margin: 0;
  padding: var(--space-2) 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.doctor-panel__link {
  align-self: flex-start;
  margin-top: auto;
  padding: var(--space-2) 0 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  cursor: pointer;
}

@media (prefers-reduced-motion: reduce) {
  .doctor-panel__kpi {
    transition: none;
  }
}
</style>
