<template>
  <div class="view-appointments">
    <div class="view-appointments__toolbar">
      <VBtnToggle
        v-model="range"
        mandatory
        density="comfortable"
        variant="flat"
        color="primary"
        rounded="lg"
        class="view-appointments__toggle"
      >
        <AppButton value="day" size="small">{{ t('user.planner.viewDay') }}</AppButton>
        <AppButton value="week" size="small">{{ t('user.planner.viewWeek') }}</AppButton>
      </VBtnToggle>
      <div class="view-appointments__nav">
        <AppButton icon variant="flat" size="small" class="view-appointments__nav-btn" :aria-label="t('user.planner.prev')" @click="shift(-1)">
          <AppIcon name="chevron-left" />
        </AppButton>
        <AppButton variant="text" size="small" class="view-appointments__today" @click="goToday">{{ t('user.planner.today') }}</AppButton>
        <AppButton icon variant="flat" size="small" class="view-appointments__nav-btn" :aria-label="t('user.planner.next')" @click="shift(1)">
          <AppIcon name="chevron-right" />
        </AppButton>
        <span class="view-appointments__period">{{ periodLabel }}</span>
      </div>
      <AppButton color="primary" variant="flat" class="view-appointments__add" data-testid="appointments-add" @click="openBooking()">
        <AppIcon name="plus" class="mr-1" />
        {{ t('user.appointments.add') }}
      </AppButton>
    </div>

    <AppErrorState v-if="loadFailed" :error="loadFailure" :refresh-label="t('app.errorState.refresh')" :loading="loading" @refresh="load" />

    <!-- Phone: a plain day-grouped list (Łukasz, 2026-09-26) — a grid is too dense on a small screen. -->
    <div v-else-if="isPhone" class="view-appointments__list" data-testid="appointments-list">
      <AppLoadingState v-if="loading && !items.length" />
      <AppEmptyState v-else-if="!items.length" :title="t('user.appointments.empty')" />
      <section v-for="group in groups" v-else :key="group.key" class="view-appointments__day">
        <h2 class="view-appointments__day-title">{{ group.label }}</h2>
        <button
          v-for="a in group.items"
          :key="a.id"
          type="button"
          class="view-appointments__row"
          :class="`view-appointments__row--${a.status}`"
          @click="openDetail(a)"
        >
          <span class="view-appointments__row-time">{{ timeOf(a) }}</span>
          <span class="view-appointments__row-main">
            <span class="view-appointments__row-patient">{{ a.patient_name }}</span>
            <span class="view-appointments__row-meta">{{ metaOf(a) }}</span>
          </span>
          <VChip :color="APPOINTMENT_STATUS_COLOR[a.status]" size="x-small" variant="tonal">{{ t(`user.appointments.status.${a.status}`) }}</VChip>
        </button>
      </section>
    </div>

    <VCalendar
      v-else
      v-model="focus"
      :type="range"
      :events="calendarEvents"
      :first-interval="14"
      :interval-count="26"
      :interval-minutes="30"
      :weekdays="[1, 2, 3, 4, 5, 6, 0]"
      class="view-appointments__calendar"
      :event-ripple="false"
      data-testid="appointments-calendar"
      @click:time="onSlotClick"
      @click:event="onEventClick"
    >
      <!-- Apple Calendar look (Łukasz, 2026-09-26): tinted block, status-colored bar, name then time. -->
      <template #event="{ event }">
        <div
          class="appt-event"
          :class="`appt-event--${event.status}`"
          :style="{ '--appt-color': event.tint }"
          data-testid="appointment-event"
        >
          <span class="appt-event__title">{{ event.name }}</span>
          <span class="appt-event__meta">{{ event.time }}</span>
          <span v-if="event.doctor" class="appt-event__meta">{{ event.doctor }}</span>
        </div>
      </template>
    </VCalendar>

    <AppointmentDialog
      v-model="showBooking"
      :appointment="bookingAppointment"
      :patient="bookingPatient"
      :practitioner="bookingPractitioner"
      :start-at="bookingStart"
      @saved="onSaved"
    />
    <AppointmentDetailDialog
      v-model="showDetail"
      :appointment="selected"
      @changed="onChanged"
      @reschedule="onReschedule"
      @book-next="onBookNext"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { reportCaught } from "@api";
import { intlLocale } from "@i18n/language-options";
import { apiFetch } from "../composables/useApi";
import { useAppointments, APPOINTMENT_STATUS_COLOR, type Appointment } from "../composables/useAppointments";
import { toZonedCalendarDateTime, formatTimeRange, formatDayLabel, zonedDateKey, deviceTimeZone, zonedInputToIso } from "../utils/appointmentTime";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";

const AppointmentDialog = defineAsyncComponent(() => import("../components/AppointmentDialog.vue"));
const AppointmentDetailDialog = defineAsyncComponent(() => import("../components/AppointmentDetailDialog.vue"));

const { t, locale } = useI18n();
const { smAndUp } = useDisplay();
const { isDoctor } = useAppointments();

const isPhone = computed(() => !smAndUp.value);
const lang = computed(() => intlLocale(locale.value));

/** A doctor starts on today's agenda, staff on the week (Łukasz, 2026-09-26: simple agenda for doctors). */
const range = ref<"day" | "week">(isDoctor.value ? "day" : "week");
const focus = ref(new Date());
const items = ref<Appointment[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailure = ref<unknown>(null);

function windowOf(): { start: Date; end: Date } {
  const start = new Date(focus.value);
  start.setHours(0, 0, 0, 0);
  if (range.value === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const end = new Date(start);
  end.setDate(end.getDate() + (range.value === "week" ? 7 : 1));
  return { start, end };
}

const periodLabel = computed(() => {
  const { start, end } = windowOf();
  const fmt = new Intl.DateTimeFormat(lang.value, { day: "numeric", month: "short" });
  if (range.value === "day") return new Intl.DateTimeFormat(lang.value, { weekday: "long", day: "numeric", month: "long" }).format(start);
  const last = new Date(end.getTime() - 86_400_000);
  return `${fmt.format(start)} – ${fmt.format(last)}`;
});

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const { start, end } = windowOf();
    const res = await apiFetch(`/api/v1/appointments?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, {
      handleErrors: false,
    });
    if (!res.ok) throw new Error(`GET /appointments ${res.status}`);
    items.value = ((await res.json()) as { items?: Appointment[] }).items ?? [];
  } catch (err) {
    reportCaught(err, { where: "AppointmentsView.load" });
    loadFailed.value = true;
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}
watch([focus, range], load, { immediate: true });

function shift(direction: -1 | 1) {
  const d = new Date(focus.value);
  d.setDate(d.getDate() + direction * (range.value === "week" ? 7 : 1));
  focus.value = d;
}
function goToday() {
  focus.value = new Date();
}

/** Status → tint, Apple Calendar-style: brand teal for booked, system green/orange/grey for the outcomes. */
const STATUS_TINT: Record<Appointment["status"], string> = { scheduled: "#128F83", completed: "#34C759", cancelled: "#8E8E93", no_show: "#FF9500" };

/** Positioned in each appointment's clinic zone, so 10:00 in the clinic sits on the 10:00 line. */
const calendarEvents = computed(() =>
  items.value.map((a) => ({
    id: a.id,
    name: a.patient_name ?? "",
    start: toZonedCalendarDateTime(a.start_at, a.timezone),
    end: toZonedCalendarDateTime(a.end_at, a.timezone),
    // The block paints itself (#event slot) — VCalendar's own fill stays out of the way.
    color: "transparent",
    tint: STATUS_TINT[a.status],
    status: a.status,
    time: formatTimeRange(a.start_at, a.end_at, a.timezone, lang.value),
    doctor: a.practitioner_name ?? "",
  })),
);

const groups = computed(() => {
  const byDay = new Map<string, { key: string; label: string; items: Appointment[] }>();
  for (const a of items.value) {
    const key = zonedDateKey(a.start_at, a.timezone);
    if (!byDay.has(key)) byDay.set(key, { key, label: formatDayLabel(a.start_at, a.timezone, lang.value), items: [] });
    byDay.get(key)!.items.push(a);
  }
  return [...byDay.values()];
});

function timeOf(a: Appointment): string {
  return formatTimeRange(a.start_at, a.end_at, a.timezone, lang.value);
}
function metaOf(a: Appointment): string {
  return [a.practitioner_name, a.organization_name].filter(Boolean).join(" · ");
}

// ── booking / detail dialogs ────────────────────────────────────────────────
const showBooking = ref(false);
const bookingAppointment = ref<Appointment | null>(null);
const bookingPatient = ref<{ id: string; name: string; practitioner_id?: string | null } | null>(null);
const bookingPractitioner = ref<{ id: string; name: string } | null>(null);
const bookingStart = ref<string | null>(null);
const showDetail = ref(false);
const selected = ref<Appointment | null>(null);

function openBooking(opts: { start?: string | null; appointment?: Appointment | null; patient?: typeof bookingPatient.value; practitioner?: typeof bookingPractitioner.value } = {}) {
  bookingAppointment.value = opts.appointment ?? null;
  bookingPatient.value = opts.patient ?? null;
  bookingPractitioner.value = opts.practitioner ?? null;
  bookingStart.value = opts.start ?? null;
  showBooking.value = true;
}

function onSlotClick(_e: unknown, scope?: { date?: string; time?: string }) {
  // A click on an appointment bubbles up to the day column's click:time too — that one opens the detail, not a new booking.
  const target = (_e as { target?: unknown } | undefined)?.target;
  if (target instanceof Element && target.closest(".v-event-timed")) return;
  const s = scope ?? (_e as { date?: string; time?: string });
  if (!s?.date || !s.time) return;
  const [h, m] = s.time.split(":").map(Number);
  const rounded = `${s.date}T${String(h).padStart(2, "0")}:${(m ?? 0) < 30 ? "00" : "30"}`;
  openBooking({ start: zonedInputToIso(rounded, deviceTimeZone()) });
}

function onEventClick(_e: unknown, payload?: { event?: { id?: string } }) {
  const id = payload?.event?.id ?? (_e as { event?: { id?: string } })?.event?.id;
  const a = items.value.find((x) => x.id === id);
  if (a) openDetail(a);
}

function openDetail(a: Appointment) {
  selected.value = a;
  showDetail.value = true;
}

function onSaved() {
  void load();
}

function onChanged(a: Appointment) {
  selected.value = a;
  void load();
}

function onReschedule(a: Appointment) {
  showDetail.value = false;
  openBooking({ appointment: a });
}

/** After a completed visit: same patient and doctor, same time a week later as a starting point. */
function onBookNext(a: Appointment) {
  showDetail.value = false;
  openBooking({
    patient: { id: a.patient_id, name: a.patient_name ?? "", practitioner_id: a.practitioner_id },
    practitioner: { id: a.practitioner_id, name: a.practitioner_name ?? "" },
    start: new Date(new Date(a.start_at).getTime() + 7 * 86_400_000).toISOString(),
  });
}
</script>

<style scoped>
.view-appointments {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px;
  gap: 16px;
}

.view-appointments__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.view-appointments__toggle {
  background: var(--pwa-bg-secondary, rgba(var(--v-theme-on-surface), 0.04));
  padding: 4px;

  :deep(.v-btn) {
    text-transform: none;
    font-weight: 500;
  }
}

.view-appointments__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-appointments__nav-btn {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
}

.view-appointments__today {
  min-height: var(--pwa-btn-min-height, 44px);
}

.view-appointments__period {
  margin-left: 8px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.view-appointments__add {
  margin-left: auto;
  text-transform: none;
}

/* Phone: the period gets its own line under the arrows instead of wrapping mid-date. */
@media (max-width: 599px) {
  .view-appointments__nav {
    flex-wrap: wrap;
  }

  .view-appointments__period {
    flex-basis: 100%;
    margin-left: 0;
    padding-inline: 4px;
  }
}

.view-appointments__calendar {
  flex: 1 1 auto;
  min-height: 420px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
}

/* VCalendar's event wrapper: no fill, border or padding of its own — .appt-event draws the block. */
.view-appointments__calendar :deep(.v-event-timed) {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none;
  padding: 0 1px;
  overflow: hidden;
}

.appt-event {
  display: flex;
  flex-direction: column;
  gap: 1px;
  height: 100%;
  box-sizing: border-box;
  padding: 3px 6px 3px 7px;
  border-left: 3px solid var(--appt-color);
  border-radius: 5px;
  background: color-mix(in srgb, var(--appt-color) 16%, rgb(var(--v-theme-surface)));
  color: color-mix(in srgb, var(--appt-color) 62%, rgb(var(--v-theme-on-surface)));
  font-size: 0.75rem;
  line-height: 1.25;
  cursor: pointer;
  overflow: hidden;
}

.appt-event:hover {
  background: color-mix(in srgb, var(--appt-color) 24%, rgb(var(--v-theme-surface)));
}

.appt-event__title {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.appt-event__meta {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.appt-event--cancelled .appt-event__title {
  text-decoration: line-through;
}

.view-appointments__list {
  display: grid;
  gap: 20px;
}

.view-appointments__day {
  display: grid;
  gap: 4px;
}

.view-appointments__day-title {
  margin: 0 0 4px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-appointments__row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.view-appointments__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.view-appointments__row--cancelled .view-appointments__row-patient {
  text-decoration: line-through;
  opacity: 0.6;
}

.view-appointments__row-time {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
}

.view-appointments__row-main {
  display: grid;
  min-width: 0;
}

.view-appointments__row-patient {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-appointments__row-meta {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
