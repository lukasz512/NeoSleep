<template>
  <section v-if="enabled" class="doctor-panel" data-testid="doctor-panel" :aria-label="t('app.doctorPanel.label')">
    <article class="doctor-panel__tile" data-testid="doctor-panel-today">
      <header class="doctor-panel__head">
        <h2 class="doctor-panel__title">{{ t("app.doctorPanel.today.title") }}</h2>
        <span class="doctor-panel__count" data-testid="doctor-panel-today-count">{{ visits.length }}</span>
      </header>
      <p v-if="!visits.length" class="doctor-panel__empty" data-testid="doctor-panel-today-empty">
        {{ t("app.doctorPanel.today.empty") }}
      </p>
      <template v-for="day in visitDays" v-else :key="day.key">
        <h3 class="doctor-panel__day" data-testid="doctor-panel-day">{{ t(`app.doctorPanel.today.day.${day.key}`) }}</h3>
        <RouterLink
          v-for="visit in day.visits"
          :key="visit.id"
          :to="{ name: 'patient-detail', params: { id: visit.patient_id } }"
          class="doctor-panel__row"
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

    <article class="doctor-panel__tile" data-testid="doctor-panel-actions">
      <header class="doctor-panel__head">
        <h2 class="doctor-panel__title">{{ t("app.doctorPanel.actions.title") }}</h2>
        <span class="doctor-panel__count" :class="{ 'doctor-panel__count--due': actions.length }" data-testid="doctor-panel-actions-count">
          {{ actions.length }}
        </span>
      </header>
      <p v-if="!actions.length" class="doctor-panel__empty" data-testid="doctor-panel-actions-empty">
        {{ t("app.doctorPanel.actions.empty") }}
      </p>
      <RouterLink
        v-for="action in shownActions"
        :key="`${action.kind}:${action.patient_id}:${action.ref_id}`"
        :to="{ name: 'patient-detail', params: { id: action.patient_id } }"
        class="doctor-panel__row"
        data-testid="doctor-panel-action"
      >
        <span class="doctor-panel__dot" :class="`doctor-panel__dot--${action.kind}`" aria-hidden="true" />
        <span class="doctor-panel__main">
          <span class="doctor-panel__name">{{ action.patient_name }}</span>
          <span class="doctor-panel__meta">{{ t(`app.doctorPanel.actions.kind.${action.kind}`) }}</span>
        </span>
      </RouterLink>
      <button
        v-if="actions.length > ACTIONS_PREVIEW"
        type="button"
        class="doctor-panel__link"
        data-testid="doctor-panel-actions-more"
        @click="showAll = !showAll"
      >
        {{ showAll ? t("app.doctorPanel.actions.showLess") : t("app.doctorPanel.actions.showAll", { count: actions.length }) }}
      </button>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../../composables/useApi";
import { appointmentResponseState, type Appointment, type AppointmentResponseState } from "../../composables/useAppointments";
import { intlLocaleFor } from "../../utils/notificationFeed";

/**
 * Doctor Panel tiles ① Upcoming visits + ② Needs your action (NEO-233,
 * docs/stories/doctor-panel-today-and-actions.md) — on top of the doctor's patient list (D1).
 * Renders nothing while the per-tenant switch is off (GET /doctor-panel/actions → enabled: false).
 */

type ActionKind = "results_to_interpret" | "cannot_attend" | "plan_not_notified" | "consent_missing";

interface DoctorAction {
  kind: ActionKind;
  patient_id: string;
  patient_name: string | null;
  ref_id: string;
  at: string | null;
}

type Visit = Pick<Appointment, "id" | "patient_id" | "patient_name" | "organization_name" | "status" | "start_at" | "patient_response" | "confirm_request_sent_at">;

/** Rows shown before "Show all" — a consent backlog must not push the patient list off screen. */
const ACTIONS_PREVIEW = 5;

const { t, locale } = useI18n();
const enabled = ref(false);
const actions = ref<DoctorAction[]>([]);
const visits = ref<Visit[]>([]);
const showAll = ref(false);

const shownActions = computed(() => (showAll.value ? actions.value : actions.value.slice(0, ACTIONS_PREVIEW)));

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
}

const visitDays = computed(() => {
  const tomorrow = startOfDay(1).getTime();
  const days = [
    { key: "today" as const, visits: visits.value.filter((v) => new Date(v.start_at).getTime() < tomorrow) },
    { key: "tomorrow" as const, visits: visits.value.filter((v) => new Date(v.start_at).getTime() >= tomorrow) },
  ];
  return days.filter((d) => d.visits.length);
});

function timeOf(iso: string): string {
  return new Intl.DateTimeFormat(intlLocaleFor(locale.value), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function responseOf(visit: Visit): AppointmentResponseState | null {
  return appointmentResponseState(visit);
}

async function load(): Promise<void> {
  const res = await apiFetch("/api/v1/doctor-panel/actions");
  if (!res.ok) return;
  const body = (await res.json()) as { enabled: boolean; items: DoctorAction[] };
  if (!body.enabled) return;
  actions.value = body.items;
  enabled.value = true;

  const params = new URLSearchParams({ start: startOfDay(0).toISOString(), end: startOfDay(2).toISOString() });
  const visitsRes = await apiFetch(`/api/v1/appointments?${params.toString()}`);
  if (!visitsRes.ok) return;
  const { items } = (await visitsRes.json()) as { items: Visit[] };
  visits.value = items
    .filter((v) => v.status !== "cancelled")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

onMounted(() => {
  void load();
});
</script>

<style scoped>
.doctor-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-4);
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
</style>
