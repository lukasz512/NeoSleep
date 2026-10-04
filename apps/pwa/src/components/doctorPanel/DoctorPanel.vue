<template>
  <section
    class="dp"
    :class="{ 'dp--shown': shown, 'dp--loaded': loaded, 'dp--in': entered, 'dp--leaving': leaving }" data-testid="doctor-panel" :aria-label="t('app.doctorPanel.label')">
    <!-- Soft colour behind the glass, so the blur has something to bend (NEO-238). -->
    <div class="dp__aurora" aria-hidden="true">
      <span class="dp__blob dp__blob--a" />
      <span class="dp__blob dp__blob--b" />
      <span class="dp__blob dp__blob--c" />
    </div>

    <div class="dp__hero">
      <div class="dp__intro dp-in" style="--i: 0">
        <div class="dp__hello">
          <h1 class="dp__greeting" data-testid="doctor-panel-greeting">{{ greeting }}</h1>
          <p class="dp__date">
            {{ todayLabel }}<template v-if="summary"> · {{ t("app.doctorPanel.activePatients", { count: activeTotal }) }}</template>
          </p>
        </div>
        <div class="dp__search">
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
            class="dp__search-field"
            data-testid="doctor-panel-search"
          />
          <div v-if="(search ?? '').trim().length >= MIN_SEARCH" class="dp__results dp-glass" data-testid="doctor-panel-search-results">
            <RouterLink
              v-for="hit in hits"
              :key="hit.id"
              :to="{ name: 'patient-detail', params: { id: hit.id } }"
              class="dp__row"
              data-testid="doctor-panel-search-hit"
            >
              <span class="dp__name">{{ hit.name }}</span>
            </RouterLink>
            <p v-if="searched && !hits.length" class="dp__empty">{{ t("app.doctorPanel.search.empty") }}</p>
          </div>
        </div>

        <div class="dp__kpis">
          <RouterLink :to="{ name: 'calendar' }" class="dp__kpi dp-glass" style="--kpi: var(--v-theme-primary)" data-testid="doctor-panel-kpi-visits">
            <span class="dp__kpi-label">{{ t("app.doctorPanel.kpi.visitsToday") }}</span>
            <span class="dp-skel dp-skel--kpi" aria-hidden="true"><i /><i /></span>
            <b class="dp__kpi-value">{{ kpiVisits }}</b>
            <small class="dp__kpi-sub">{{ visitsSub }}</small>
          </RouterLink>
          <a href="#doctor-panel-actions" class="dp__kpi dp-glass" style="--kpi: var(--v-theme-error)" data-testid="doctor-panel-kpi-interpret" @click.prevent="scrollTo('doctor-panel-actions')">
            <span class="dp__kpi-label">{{ t("app.doctorPanel.kpi.toInterpret") }}</span>
            <span class="dp-skel dp-skel--kpi" aria-hidden="true"><i /><i /></span>
            <b class="dp__kpi-value">{{ kpiInterpret }}</b>
            <small class="dp__kpi-sub">{{ interpretSub }}</small>
          </a>
          <a href="#doctor-panel-incomplete" class="dp__kpi dp-glass" style="--kpi: var(--v-theme-warning)" data-testid="doctor-panel-kpi-incomplete" @click.prevent="scrollTo('doctor-panel-incomplete')">
            <span class="dp__kpi-label">{{ t("app.doctorPanel.kpi.incomplete") }}</span>
            <span class="dp-skel dp-skel--kpi" aria-hidden="true"><i /><i /></span>
            <b class="dp__kpi-value">{{ kpiIncomplete }}</b>
            <small class="dp__kpi-sub">{{ t("app.doctorPanel.kpi.incompleteSub") }}</small>
          </a>
          <RouterLink :to="{ name: 'treatment-plans' }" class="dp__kpi dp-glass" style="--kpi: var(--v-theme-success)" data-testid="doctor-panel-kpi-treatment">
            <span class="dp__kpi-label">{{ t("app.doctorPanel.kpi.inTreatment") }}</span>
            <span class="dp-skel dp-skel--kpi" aria-hidden="true"><i /><i /></span>
            <b class="dp__kpi-value">{{ kpiTreatment }}</b>
            <small class="dp__kpi-sub">{{ t("app.doctorPanel.kpi.inTreatmentSub", { count: activeTotal }) }}</small>
          </RouterLink>
        </div>
      </div>

      <article class="dp__card dp__ring dp-glass dp-in" style="--i: 1" data-testid="doctor-panel-stages">
        <header class="dp__head">
          <h2 class="dp__title">{{ t("app.doctorPanel.stages.title") }}</h2>
          <RouterLink :to="{ name: 'patients' }" class="dp__more">{{ t("app.doctorPanel.stages.all") }}</RouterLink>
        </header>
        <!-- Skeleton and ring share one slot, so the ring lands exactly where the skeleton was. -->
        <div class="dp__ring-body">
          <div class="dp-skel dp-skel--ring" aria-hidden="true" data-testid="doctor-panel-skeleton"><i /><span><i /><i /><i /><i /></span></div>
          <p v-if="summary && !activeTotal" class="dp__empty">{{ t("app.doctorPanel.stages.empty") }}</p>
          <DoctorPanelDonut
            v-else
            :slices="stageSlices"
            :drawn="donutDrawn"
            :caption="t('app.doctorPanel.stages.caption')"
            :aria-label="t('app.doctorPanel.stages.aria', { count: activeTotal })"
          />
        </div>
      </article>
    </div>

    <div class="dp__grid">
      <article class="dp__card dp-glass dp-in" style="--i: 2" data-testid="doctor-panel-today">
        <header class="dp__head">
          <h2 class="dp__title">{{ t("app.doctorPanel.today.title") }}</h2>
          <span class="dp__count" data-testid="doctor-panel-today-count">{{ visits.length }}</span>
        </header>
        <div class="dp-skel dp-skel--rows" aria-hidden="true"><i /><i /><i /></div>
        <p v-if="!visits.length" class="dp__empty" data-testid="doctor-panel-today-empty">{{ t("app.doctorPanel.today.empty") }}</p>
        <RouterLink
          v-for="visit in shownVisits"
          :key="visit.id"
          :to="{ name: 'patient-detail', params: { id: visit.patient_id } }"
          class="dp__row"
          :class="{ 'dp__row--now': visit.id === nextVisitId }"
          data-testid="doctor-panel-visit"
        >
          <span class="dp__time">
            {{ timeOf(visit.start_at) }}
            <small v-if="!isToday(visit)" class="dp__day">{{ t("app.doctorPanel.today.day.tomorrow") }}</small>
          </span>
          <span class="dp__main">
            <span class="dp__name">{{ visit.patient_name }}</span>
            <span v-if="responseOf(visit)" class="dp__meta" :class="`dp__meta--${responseOf(visit)}`">
              {{ t(`user.appointments.patientResponse.${responseOf(visit)}`) }}
            </span>
          </span>
        </RouterLink>
        <RouterLink :to="{ name: 'calendar' }" class="dp__more dp__more--foot">{{ t("app.doctorPanel.today.calendar") }}</RouterLink>
      </article>

      <article id="doctor-panel-actions" class="dp__card dp-glass dp-in" style="--i: 3" data-testid="doctor-panel-actions">
        <header class="dp__head">
          <h2 class="dp__title">{{ t("app.doctorPanel.actions.title") }}</h2>
          <span class="dp__count" :class="{ 'dp__count--due': actions.length }" data-testid="doctor-panel-actions-count">{{ actions.length }}</span>
        </header>
        <div class="dp-skel dp-skel--rows" aria-hidden="true"><i /><i /><i /></div>
        <p v-if="!actions.length" class="dp__empty" data-testid="doctor-panel-actions-empty">{{ t("app.doctorPanel.actions.empty") }}</p>
        <RouterLink
          v-for="group in actionGroups"
          :key="group.kind"
          :to="{ name: 'patient-detail', params: { id: group.items[0].patient_id } }"
          class="dp__row"
          data-testid="doctor-panel-action-group"
        >
          <span class="dp__dot" :class="`dp__dot--${group.kind}`" aria-hidden="true" />
          <span class="dp__main">
            <span class="dp__name">{{ t(`app.doctorPanel.actions.kind.${group.kind}`) }}</span>
            <span class="dp__meta" data-testid="doctor-panel-action">
              {{ group.items[0].patient_name }}<template v-if="group.items.length > 1"> · {{ t("app.doctorPanel.actions.more", { count: group.items.length - 1 }) }}</template>
            </span>
          </span>
          <b class="dp__badge" :class="`dp__badge--${group.kind}`">{{ group.items.length }}</b>
        </RouterLink>
      </article>

      <article id="doctor-panel-incomplete" class="dp__card dp-glass dp-in" style="--i: 4" data-testid="doctor-panel-incomplete">
        <header class="dp__head">
          <h2 class="dp__title">{{ t("app.doctorPanel.incomplete.title") }}</h2>
          <span class="dp__count" :class="{ 'dp__count--warn': incomplete.length }">{{ incomplete.length }}</span>
        </header>
        <div class="dp-skel dp-skel--rows" aria-hidden="true"><i /><i /><i /></div>
        <p v-if="!incomplete.length" class="dp__empty" data-testid="doctor-panel-incomplete-empty">{{ t("app.doctorPanel.incomplete.empty") }}</p>
        <RouterLink
          v-for="row in shownIncomplete"
          :key="row.patient_id"
          :to="{ name: 'patient-detail', params: { id: row.patient_id } }"
          class="dp__row"
          data-testid="doctor-panel-incomplete-row"
        >
          <span class="dp__main">
            <span class="dp__name">{{ row.patient_name }}</span>
            <span class="dp__meta">{{ t("app.doctorPanel.incomplete.missing", { items: missingLabel(row.missing) }) }}</span>
          </span>
          <span class="dp__meter" role="meter" :aria-valuenow="row.done" aria-valuemin="0" :aria-valuemax="row.total" :aria-label="`${row.done}/${row.total}`">
            <i :style="{ width: entered ? `${(row.done / row.total) * 100}%` : '0%' }" />
          </span>
        </RouterLink>
        <button
          v-if="incomplete.length > LIST_PREVIEW"
          type="button"
          class="dp__more dp__more--foot"
          data-testid="doctor-panel-incomplete-more"
          @click="showAllIncomplete = !showAllIncomplete"
        >
          {{ showAllIncomplete ? t("app.doctorPanel.actions.showLess") : t("app.doctorPanel.actions.showAll", { count: incomplete.length }) }}
        </button>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { onBeforeRouteLeave } from "vue-router";
import { apiFetch } from "../../composables/useApi";
import { appointmentResponseState, type Appointment, type AppointmentResponseState } from "../../composables/useAppointments";
import { useCountUp } from "../../composables/useCountUp";
import { useAuthStore } from "../../stores/auth";
import { intlLocaleFor } from "../../utils/notificationFeed";
import DoctorPanelDonut, { type DonutSlice } from "./DoctorPanelDonut.vue";

/**
 * The doctor's Panel (NEO-233; NEO-238 quick-glance redesign): their own start screen.
 * Top: greeting, search and 4 counting indicators beside the animated stage ring.
 * Below: three short glass cards — agenda, what waits on them, incomplete files — each
 * at most LIST_PREVIEW rows. Own patients only (CORE-104); no new data.
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
  intake: "rgba(var(--v-theme-on-surface), 0.3)",
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

/** Rows per card: a glance, not a list (Łukasz, NEO-238: "3, 4 items"). */
const LIST_PREVIEW = 4;
const MIN_SEARCH = 2;
const SEARCH_DEBOUNCE_MS = 250;
/** How long the route waits for the cards and ring to fold away — matches the CSS below. */
const LEAVE_MS = 420;
/**
 * The content waits this long after mount before it plays in (NEO-239): the page change
 * (page-transitions.css, 520 ms) runs first, the skeleton covers the wait, then the
 * numbers count and the ring spins where the doctor can actually see them.
 */
const ENTRANCE_DELAY_MS = 560;
/** Indicators start one after another: Citas hoy at 0 ms, each next one this much later. */
const KPI_STAGGER_MS = 150;
const COUNT_MS = 1400;
const DAY_MS = 86_400_000;

const { t, te, locale } = useI18n();
const authStore = useAuthStore();

const actions = ref<DoctorAction[]>([]);
const visits = ref<Visit[]>([]);
const summary = ref<Summary | null>(null);
const showAllIncomplete = ref(false);
/** Card shells rise in right away (skeleton inside). */
const shown = ref(false);
/** The three requests answered. */
const loaded = ref(false);
/** Content plays in: skeleton fades, numbers count, ring spins. */
const entered = ref(false);
/** Folding away before the route changes. */
const leaving = ref(false);
let mountedAt = 0;
const donutDrawn = ref(false);

const search = ref<string | null>("");
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
const shownIncomplete = computed(() => (showAllIncomplete.value ? incomplete.value : incomplete.value.slice(0, LIST_PREVIEW)));

const isToday = (v: Visit): boolean => new Date(v.start_at).getTime() < startOfDay(1).getTime();
const todayVisits = computed(() => visits.value.filter(isToday));
const shownVisits = computed(() => visits.value.slice(0, LIST_PREVIEW));
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

const kpiVisits = useCountUp(computed(() => todayVisits.value.length), COUNT_MS, entered, 0);
const kpiInterpret = useCountUp(computed(() => toInterpret.value.length), COUNT_MS, entered, KPI_STAGGER_MS);
const kpiIncomplete = useCountUp(computed(() => incomplete.value.length), COUNT_MS, entered, 2 * KPI_STAGGER_MS);
const kpiTreatment = useCountUp(computed(() => summary.value?.stages.treatment ?? 0), COUNT_MS, entered, 3 * KPI_STAGGER_MS);

/** One row per kind of waiting item (at most 4 kinds), its oldest patient first. */
const actionGroups = computed(() =>
  ACTION_KINDS.map((kind) => ({ kind, items: actions.value.filter((a) => a.kind === kind) })).filter((g) => g.items.length)
);

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
  loaded.value = true;
  // Play in only once the page change is over, so the motion is seen, not missed.
  await nextTick();
  const wait = prefersReducedMotion() ? 0 : Math.max(0, mountedAt + ENTRANCE_DELAY_MS - Date.now());
  setTimeout(() => {
    requestAnimationFrame(() => {
      entered.value = true;
      donutDrawn.value = true;
    });
  }, wait);
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

// Everything folds away before the page changes (Łukasz: "animates on the way in and out").
onBeforeRouteLeave(async () => {
  if (!shown.value || prefersReducedMotion()) return true;
  leaving.value = true;
  donutDrawn.value = false;
  await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
  return true;
});

onMounted(() => {
  mountedAt = Date.now();
  // Two frames so the shells start from their hidden state and rise in.
  requestAnimationFrame(() => requestAnimationFrame(() => (shown.value = true)));
  void load();
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>

<style scoped>
.dp {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4) 0;
}

/* ---- liquid backdrop --------------------------------------------------- */
.dp__aurora {
  position: absolute;
  z-index: -1;
  /* Out to the white sheet's own edges (AppLayout --layout-card-inset), so the colour and
     the cards' glow are never cut off in a box inside it (NEO-239); fades in from the top. */
  inset: -200px calc(-1 * var(--layout-card-inset, 16px)) calc(-1 * var(--layout-card-inset, 16px));
  overflow: hidden;
  border-radius: 0 0 var(--pwa-sheet-radius, 16px) var(--pwa-sheet-radius, 16px);
  pointer-events: none;
  mask-image: linear-gradient(to bottom, transparent 0, #000 260px);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 260px);
}

.dp__blob {
  position: absolute;
  width: 420px;
  height: 420px;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.32;
  animation: dp-drift 22s ease-in-out infinite alternate;
}

.dp__blob--a {
  top: -120px;
  right: 6%;
  background: rgb(var(--v-theme-primary));
}

.dp__blob--b {
  top: 30%;
  left: -140px;
  background: rgb(var(--v-theme-info));
  opacity: 0.18;
  animation-duration: 28s;
}

.dp__blob--c {
  bottom: -160px;
  right: 30%;
  background: rgb(var(--v-theme-success));
  opacity: 0.16;
  animation-duration: 34s;
}

@keyframes dp-drift {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(40px, 30px, 0) scale(1.12);
  }
}

/* ---- glass surface (CORE-119 tokens) ---------------------------------- */
.dp-glass {
  border: 1px solid var(--glass-edge);
  background: var(--glass-sheen), var(--glass-surface);
  box-shadow: var(--glass-rim), var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

/* ---- staggered entrance / exit ----------------------------------------- */
/* Shells rise in at once with the skeleton inside; the content plays in later (dp--in). */
.dp-in {
  opacity: 0;
  transform: translateY(22px) scale(0.97);
  filter: blur(10px);
  transition:
    opacity 0.7s ease,
    transform 1s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.8s ease;
  transition-delay: calc(var(--i, 0) * 110ms);
}

.dp--shown .dp-in {
  opacity: 1;
  transform: none;
  filter: none;
}

.dp--leaving .dp-in {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
  filter: blur(8px);
  transition-duration: 0.35s;
  transition-delay: calc(var(--i, 0) * 30ms);
}

/* Content hidden behind the skeleton until it plays in, then a soft crossfade. */
.dp__kpi > :not(.dp__kpi-label):not(.dp-skel),
.dp__card > :not(.dp__head):not(.dp-skel):not(.dp__ring-body),
.dp__ring-body > :not(.dp-skel) {
  transition:
    opacity 0.6s ease,
    transform 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.dp:not(.dp--in) .dp__kpi > :not(.dp__kpi-label):not(.dp-skel),
.dp:not(.dp--in) .dp__card > :not(.dp__head):not(.dp-skel):not(.dp__ring-body) {
  opacity: 0;
  transform: translateY(6px);
}

/* The ring itself does not slide: it swings in on the spot the skeleton held. */
.dp:not(.dp--in) .dp__ring-body > :not(.dp-skel) {
  opacity: 0;
}

/* ---- skeleton ------------------------------------------------------------ */
.dp-skel {
  position: absolute;
  pointer-events: none;
  transition: opacity 0.5s ease;
}

.dp--in .dp-skel {
  opacity: 0;
}

.dp-skel i,
.dp-skel--ring > i {
  display: block;
  border-radius: 8px;
  background: linear-gradient(
    100deg,
    rgba(var(--v-theme-on-surface), 0.06) 30%,
    rgba(var(--v-theme-on-surface), 0.13) 50%,
    rgba(var(--v-theme-on-surface), 0.06) 70%
  );
  background-size: 300% 100%;
  animation: dp-shimmer 1.4s ease-in-out infinite;
}

@keyframes dp-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}

.dp-skel--kpi {
  top: 38px;
  left: var(--space-4);
  display: grid;
  gap: 10px;
}

.dp-skel--kpi i:first-child {
  width: 48px;
  height: 30px;
}

.dp-skel--kpi i:last-child {
  width: 96px;
  height: 10px;
}

.dp-skel--rows {
  top: 64px;
  right: var(--space-4);
  left: var(--space-4);
  display: grid;
  gap: 22px;
}

.dp-skel--rows i {
  height: 30px;
  border-radius: 10px;
}

.dp-skel--rows i:nth-child(2) {
  width: 82%;
}

.dp-skel--rows i:nth-child(3) {
  width: 64%;
}

.dp__ring-body {
  position: relative;
}

/* Same box and flex rules as DoctorPanelDonut (176 px stage, legend flex 1 / min 170 px),
   so the skeleton ring sits exactly where the real ring swings in. */
.dp-skel--ring {
  inset: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

/* The ring track itself (r 48, stroke 13 of a 120 box), at the 0.8 scale the ring starts from. */
.dp-skel--ring > i {
  flex: none;
  width: 176px;
  height: 176px;
  border-radius: 50%;
  transform: scale(0.8);
  -webkit-mask: radial-gradient(closest-side, transparent 69%, #000 69.5%, #000 90.5%, transparent 91%);
  mask: radial-gradient(closest-side, transparent 69%, #000 69.5%, #000 90.5%, transparent 91%);
}

.dp-skel--ring > span {
  display: grid;
  flex: 1;
  gap: 12px;
  min-width: 170px;
}

.dp-skel--ring > span i {
  max-width: 200px;
  height: 12px;
}

/* ---- hero: intro + ring top right -------------------------------------- */
.dp__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}

@media (min-width: 960px) {
  .dp__hero {
    grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
    align-items: stretch;
  }
}

.dp__intro {
  display: grid;
  align-content: start;
  gap: var(--space-3);
}

.dp__greeting {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.15;
}

.dp__date {
  margin: var(--space-1) 0 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__date::first-letter {
  text-transform: uppercase;
}

.dp__search {
  position: relative;
}

.dp__search-field :deep(.v-field) {
  border-radius: 14px;
  background: var(--glass-surface);
  box-shadow: var(--glass-rim);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

.dp__results {
  position: absolute;
  z-index: 5;
  top: calc(100% + var(--space-1));
  right: 0;
  left: 0;
  display: grid;
  padding: var(--space-2);
  border-radius: 16px;
}

.dp__kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (min-width: 1280px) {
  .dp__kpis {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.dp__kpi {
  position: relative;
  min-height: 112px;
  display: grid;
  gap: 2px;
  overflow: hidden;
  padding: var(--space-3) var(--space-4);
  border-radius: 18px;
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.25s ease;
}

/* A drop of the indicator's colour in the glass. */
.dp__kpi::after {
  content: "";
  position: absolute;
  top: -40%;
  right: -20%;
  width: 70%;
  height: 120%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(var(--kpi), 0.22), transparent);
  pointer-events: none;
}

.dp__kpi:hover,
.dp__kpi:focus-visible {
  transform: translateY(-2px);
  box-shadow: var(--glass-rim), 0 18px 40px -16px rgba(var(--kpi), 0.55);
}

.dp__kpi-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__kpi-value {
  font-size: 2rem;
  font-weight: 650;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dp__kpi-sub {
  font-size: 0.75rem;
  color: rgb(var(--kpi));
}

/* ---- cards ------------------------------------------------------------- */
.dp__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}

@media (min-width: 760px) {
  .dp__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1100px) {
  .dp__grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.dp__card {
  position: relative;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--space-4);
  border-radius: 22px;
  scroll-margin-top: 24px;
}

.dp__ring {
  justify-content: center;
}

.dp__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}

.dp__title {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__count {
  min-width: 26px;
  padding: 0 var(--space-2);
  border-radius: 13px;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 26px;
  text-align: center;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.dp__count--due {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
}

.dp__count--warn {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.16);
}

.dp__row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 52px;
  margin: 0 calc(-1 * var(--space-2));
  padding: var(--space-1) var(--space-2);
  border-radius: 14px;
  color: inherit;
  text-decoration: none;
  transition:
    background-color 0.2s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.dp__row:hover,
.dp__row:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.05);
  transform: translateX(2px);
}

.dp__row--now {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 3px 0 0 rgb(var(--v-theme-primary));
}

.dp__time {
  display: grid;
  flex: none;
  min-width: 78px;
  white-space: nowrap;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dp__day {
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.dp__name,
.dp__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dp__name {
  font-weight: 500;
}

.dp__meta {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__meta--confirmed {
  color: rgb(var(--v-theme-success));
}

.dp__meta--cannot_attend {
  color: rgb(var(--v-theme-error));
}

.dp__dot {
  --dot: var(--v-theme-on-surface);
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--dot));
  box-shadow: 0 0 0 4px rgba(var(--dot), 0.14);
}

.dp__dot--results_to_interpret,
.dp__badge--results_to_interpret {
  --dot: var(--v-theme-primary);
}

.dp__dot--cannot_attend,
.dp__badge--cannot_attend {
  --dot: var(--v-theme-error);
}

.dp__dot--plan_not_notified,
.dp__dot--consent_missing,
.dp__badge--plan_not_notified,
.dp__badge--consent_missing {
  --dot: var(--v-theme-warning);
}

.dp__badge {
  flex: none;
  min-width: 26px;
  padding: 0 var(--space-2);
  border-radius: 13px;
  font-size: 0.8125rem;
  line-height: 26px;
  text-align: center;
  color: rgb(var(--dot));
  background: rgba(var(--dot), 0.14);
  font-variant-numeric: tabular-nums;
}

.dp__meter {
  flex: none;
  width: 64px;
  height: 8px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.dp__meter i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, rgb(var(--v-theme-success)), color-mix(in srgb, rgb(var(--v-theme-success)) 60%, white));
  transition: width 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.3s;
}

.dp__empty {
  margin: 0;
  padding: var(--space-2) 0;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dp__more {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  cursor: pointer;
}

.dp__more--foot {
  align-self: flex-start;
  margin-top: auto;
  padding-top: var(--space-2);
}

@media (prefers-reduced-motion: reduce) {
  .dp__blob,
  .dp-skel i,
  .dp-skel--ring > i {
    animation: none;
  }

  .dp-in,
  .dp-skel,
  .dp__kpi,
  .dp__kpi > *,
  .dp__card > *,
  .dp__row,
  .dp__meter i {
    transition: none;
  }
}
</style>
