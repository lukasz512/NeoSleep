<template>
  <div class="view-calendar">
    <div class="view-calendar__toolbar">
      <VBtnToggle
        v-model="calendarType"
        mandatory
        density="comfortable"
        variant="flat"
        color="primary"
        rounded="lg"
        class="view-calendar__view-toggle"
      >
        <AppButton value="day" size="small" data-testid="calendar-view-day">{{ t('user.planner.viewDay') }}</AppButton>
        <AppButton value="week" size="small" data-testid="calendar-view-week">{{ t('user.planner.viewWeek') }}</AppButton>
        <AppButton value="agenda" size="small" data-testid="calendar-view-agenda">{{ t('user.planner.viewAgenda') }}</AppButton>
      </VBtnToggle>

      <div class="view-calendar__nav">
        <AppButton icon variant="flat" size="small" class="view-calendar__nav-btn" :aria-label="t('user.planner.prev')" @click="shift(-1)">
          <AppIcon name="chevron-left" />
        </AppButton>
        <AppButton variant="text" size="small" class="view-calendar__today" @click="goToday">{{ t('user.planner.today') }}</AppButton>
        <AppButton icon variant="flat" size="small" class="view-calendar__nav-btn" :aria-label="t('user.planner.next')" @click="shift(1)">
          <AppIcon name="chevron-right" />
        </AppButton>
        <span class="view-calendar__period">{{ periodLabel }}</span>
      </div>

      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-calendar__add"
            data-testid="calendar-add"
            :aria-label="t('user.calendar.add')"
            @click="openAddChoice()"
          >
            <AppIcon name="plus" class="view-calendar__add-icon" />
          </AppButton>
        </template>
        <span>{{ t('user.calendar.add') }}</span>
      </VTooltip>
    </div>

    <AppErrorState v-if="loadFailed" :error="loadFailure" :refresh-label="t('app.errorState.refresh')" :loading="loading" @refresh="fetchItems" />

    <!-- Agenda: a plain day-grouped list, same shape for both kinds (Łukasz, 2026-09-26 precedent for phone). -->
    <div v-else-if="calendarType === 'agenda'" class="view-calendar__list" data-testid="calendar-list">
      <AppLoadingState v-if="loading && !entries.length" />
      <AppEmptyState v-else-if="!entries.length" :title="t('user.calendar.empty')" />
      <section v-for="group in groups" v-else :key="group.key" class="view-calendar__day">
        <h2 class="view-calendar__day-title">{{ group.label }}</h2>
        <button
          v-for="entry in group.items"
          :key="entry.id"
          type="button"
          class="view-calendar__row"
          :class="`view-calendar__row--${entry.status}`"
          data-testid="calendar-row"
          @click="onEntryClick(entry)"
        >
          <span class="view-calendar__row-time" :aria-label="timeOf(entry)">
            <span>{{ timeParts(entry)[0] }}</span>
            <span class="view-calendar__row-end">{{ timeParts(entry)[1] }}</span>
          </span>
          <span class="view-calendar__row-main">
            <span class="view-calendar__row-title">
              <AppIcon :name="kindIcon(entry.kind)" class="view-calendar__row-kind-icon" :style="{ color: entry.color }" />
              <span class="view-calendar__row-name">{{ entry.title }}</span>
              <AppIcon v-if="entry.response" :name="responseIcon(entry.response)" :class="`appt-response appt-response--${entry.response}`" />
            </span>
            <span v-if="entry.meta" class="view-calendar__row-meta">{{ entry.meta }}</span>
          </span>
          <VChip size="x-small" variant="tonal" :color="entry.kind === 'appointment' ? APPOINTMENT_STATUS_COLOR[entry.status as keyof typeof APPOINTMENT_STATUS_COLOR] : undefined">
            {{ t(`user.calendar.kind.${entry.kind}`) }}
          </VChip>
        </button>
      </section>
    </div>

    <!-- Day/week grid is always Mon–Sun (NEO-104 fix, kept for both kinds). -->
    <VCalendar
      v-else
      v-model="calendarValue"
      :type="calendarType"
      :events="calendarEvents"
      :first-interval="8"
      :interval-count="28"
      :interval-minutes="30"
      :weekdays="[1, 2, 3, 4, 5, 6, 0]"
      :first-day-of-week="1"
      :event-ripple="false"
      class="view-calendar__calendar"
      data-testid="calendar-grid"
      @click:time="onSlotClick"
      @click:event="onEventClick"
    >
      <template #day-header="scope">
        <span class="view-calendar__weekday">{{ formatWeekday(scope) }}</span>
      </template>
      <template #event="{ event }">
        <div class="cal-event" :class="[`cal-event--${event.status}`]" :style="{ '--cal-color': event.tint }" data-testid="calendar-event">
          <span class="cal-event__title">
            <AppIcon :name="kindIcon(event.kind)" class="cal-event__kind-icon" />
            <span class="cal-event__name">{{ event.name }}</span>
            <AppIcon v-if="event.response" :name="responseIcon(event.response)" :class="`appt-response appt-response--${event.response}`" />
          </span>
          <span class="cal-event__meta">{{ event.time }}</span>
          <span v-if="event.meta" class="cal-event__meta">{{ event.meta }}</span>
        </div>
      </template>
    </VCalendar>

    <!-- "+" offers Cita or Evento (CORE-117) — each opens its own existing dialog below. -->
    <AppFormDialog
      :model-value="showAddChoice"
      :max-width="380"
      :title="t('user.calendar.addChoice.title')"
      @update:model-value="showAddChoice = $event"
      @close="showAddChoice = false"
    >
      <VList class="view-calendar__choice-list">
        <VListItem data-testid="calendar-add-appointment" @click="onChooseAppointment">
          <template #prepend>
            <AppIcon name="nav-appointments" class="view-calendar__choice-icon" />
          </template>
          <VListItemTitle>{{ t('user.calendar.addChoice.appointment') }}</VListItemTitle>
          <VListItemSubtitle>{{ t('user.calendar.addChoice.appointmentHint') }}</VListItemSubtitle>
        </VListItem>
        <VListItem data-testid="calendar-add-event" @click="onChooseEvent">
          <template #prepend>
            <AppIcon name="nav-planner" class="view-calendar__choice-icon" />
          </template>
          <VListItemTitle>{{ t('user.calendar.addChoice.event') }}</VListItemTitle>
          <VListItemSubtitle>{{ t('user.calendar.addChoice.eventHint') }}</VListItemSubtitle>
        </VListItem>
      </VList>
    </AppFormDialog>

    <EventForm v-model="showEventForm" :initial-data="eventFormInitial" @submit="onEventFormSubmit" />

    <AppointmentDialog
      v-model="showBooking"
      :appointment="bookingAppointment"
      :patient="bookingPatient"
      :practitioner="bookingPractitioner"
      :start-at="bookingStart"
      :start-local="bookingStartLocal"
      @saved="onAppointmentSaved"
    />
    <AppointmentDetailDialog
      v-model="showDetail"
      :appointment="selectedAppointment"
      @changed="onAppointmentChanged"
      @reschedule="onReschedule"
      @book-next="onBookNext"
    />
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
import { ref, computed, watch, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { intlLocale } from "@i18n/language-options";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { useAppointments, APPOINTMENT_STATUS_COLOR, appointmentResponseState, type Appointment, type AppointmentResponseState } from "../composables/useAppointments";
import { toEncounterBody, fromEncounter, type PlannerEvent } from "../utils/encounterMapping";
import { toZonedCalendarDateTime, formatTimeRange, formatDayLabel, zonedDateKey, deviceTimeZone, zonedInputToIso } from "../utils/appointmentTime";
import { fieldErrorsFromResponse } from "../composables/useFormErrors";
import type { SubmitDone } from "../composables/useEntitySubmit";
import type { EventFormInitialData, EventSubmitPayload } from "../components/EventForm.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppEmptyState from "../components/AppEmptyState.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import AppErrorState from "../components/AppErrorState.vue";
import AppFormDialog from "../components/AppFormDialog.vue";

const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
const AppointmentDialog = defineAsyncComponent(() => import("../components/AppointmentDialog.vue"));
const AppointmentDetailDialog = defineAsyncComponent(() => import("../components/AppointmentDetailDialog.vue"));

const { t, locale } = useI18n();
const { smAndUp } = useDisplay();
const notifications = useNotifications();
const { isDoctor } = useAppointments();

const lang = computed(() => intlLocale(locale.value));
const isPhone = computed(() => !smAndUp.value);

/**
 * Default: a doctor starts on their day agenda (fewest items), other staff on
 * the week; a phone screen starts on the agenda list regardless of role —
 * same reasoning as the old Citas screen, now shared by both kinds (CORE-117).
 */
type CalendarType = "day" | "week" | "agenda";
const calendarType = ref<CalendarType>(isPhone.value ? "agenda" : isDoctor.value ? "day" : "week");
const calendarValue = ref(new Date());

// ── data: the union list ────────────────────────────────────────────────────

type CalendarItemKind = "encounter" | "appointment";

interface CalendarItemDto {
  kind: CalendarItemKind;
  id: string;
  start_at: string;
  end_at: string | null;
  data: Record<string, unknown>;
}

interface CalendarEntry {
  kind: CalendarItemKind;
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  timezone: string;
  status: string;
  color: string;
  meta?: string;
  response?: AppointmentResponseState | null;
  encounter?: PlannerEvent;
  appointment?: Appointment;
}

const entries = ref<CalendarEntry[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailure = ref<unknown>(null);

/** Map event type+status to a warm/varied color for visual richness (encounters only). */
function encounterColor(type: "f2f" | "video", status: string): string {
  if (status === "cancelled") return "#9E9E9E";
  if (status === "completed") return "#4CAF50";
  if (status === "no_show") return "#FF7043";
  return type === "video" ? "#F59E0B" : "#128F83";
}

/** Status → tint, Apple Calendar-style (appointments only). */
const STATUS_TINT: Record<Appointment["status"], string> = { scheduled: "#128F83", completed: "#34C759", cancelled: "#8E8E93", no_show: "#FF9500" };

function toEntry(item: CalendarItemDto): CalendarEntry {
  if (item.kind === "encounter") {
    const encounter = fromEncounter(item.data as Parameters<typeof fromEncounter>[0]);
    return {
      kind: "encounter",
      id: encounter.id,
      title: encounter.title || t("user.planner.form.fieldTitle"),
      start_at: encounter.start_at,
      end_at: encounter.end_at,
      timezone: deviceTimeZone(),
      status: encounter.status,
      color: encounterColor(encounter.type, encounter.status),
      meta: encounter.location || encounter.video_link || undefined,
      response: null,
      encounter,
    };
  }
  const appointment = item.data as unknown as Appointment;
  return {
    kind: "appointment",
    id: appointment.id,
    title: appointment.patient_name ?? "",
    start_at: appointment.start_at,
    end_at: appointment.end_at,
    timezone: appointment.timezone,
    status: appointment.status,
    color: STATUS_TINT[appointment.status],
    meta: [appointment.practitioner_name, appointment.organization_name].filter(Boolean).join(" · "),
    response: appointmentResponseState(appointment),
    appointment,
  };
}

function kindIcon(kind: CalendarItemKind): AppIconName {
  return kind === "appointment" ? "nav-appointments" : "nav-planner";
}

function responseIcon(response: AppointmentResponseState): AppIconName {
  if (response === "awaiting") return "clock";
  return response === "confirmed" ? "check-circle" : "alert-triangle";
}

// ── date range + nav ─────────────────────────────────────────────────────────

/** Agenda shares the week's 7-day window — only the rendering differs (list vs grid). */
function windowOf(): { start: Date; end: Date } {
  const start = new Date(calendarValue.value);
  start.setHours(0, 0, 0, 0);
  if (calendarType.value !== "day") start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const end = new Date(start);
  end.setDate(end.getDate() + (calendarType.value === "day" ? 1 : 7));
  return { start, end };
}

const periodLabel = computed(() => {
  const { start, end } = windowOf();
  const fmt = new Intl.DateTimeFormat(lang.value, { day: "numeric", month: "short" });
  if (calendarType.value === "day") return new Intl.DateTimeFormat(lang.value, { weekday: "long", day: "numeric", month: "long" }).format(start);
  const last = new Date(end.getTime() - 86_400_000);
  return `${fmt.format(start)} – ${fmt.format(last)}`;
});

async function fetchItems() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const { start, end } = windowOf();
    const res = await apiFetch(`/api/v1/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, {
      handleErrors: false,
    });
    if (!res.ok) throw new Error(`GET /calendar ${res.status}`);
    const items = ((await res.json()) as { items?: CalendarItemDto[] }).items ?? [];
    entries.value = items.map(toEntry);
  } catch (err) {
    reportCaught(err, { where: "CalendarView.fetchItems" });
    loadFailed.value = true;
    loadFailure.value = err;
  } finally {
    loading.value = false;
  }
}
watch([calendarValue, calendarType], fetchItems, { immediate: true });

function shift(direction: -1 | 1) {
  const d = new Date(calendarValue.value);
  d.setDate(d.getDate() + direction * (calendarType.value === "day" ? 1 : 7));
  calendarValue.value = d;
}
function goToday() {
  calendarValue.value = new Date();
}

function formatWeekday(scope: { weekday?: number; date?: string }): string {
  let w = scope?.weekday;
  if (w == null && scope?.date) {
    const d = new Date(scope.date + "T12:00:00");
    w = d.getDay();
  }
  if (w == null || w < 0 || w > 6) return "—";
  const key = `user.planner.weekday${w}`;
  const translated = t(key);
  return translated !== key ? translated : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w];
}

// ── grid events (day/week) ──────────────────────────────────────────────────

const calendarEvents = computed(() =>
  entries.value.map((e) => ({
    id: e.id,
    name: e.title,
    start: toZonedCalendarDateTime(e.start_at, e.timezone),
    end: toZonedCalendarDateTime(e.end_at, e.timezone),
    color: "transparent",
    tint: e.color,
    status: e.status,
    kind: e.kind,
    time: formatTimeRange(e.start_at, e.end_at, e.timezone, lang.value),
    meta: e.meta,
    response: e.response,
  })),
);

// ── agenda list ──────────────────────────────────────────────────────────────

const groups = computed(() => {
  const byDay = new Map<string, { key: string; label: string; items: CalendarEntry[] }>();
  for (const e of entries.value) {
    const key = zonedDateKey(e.start_at, e.timezone);
    if (!byDay.has(key)) byDay.set(key, { key, label: formatDayLabel(e.start_at, e.timezone, lang.value), items: [] });
    byDay.get(key)!.items.push(e);
  }
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));
});

function timeOf(e: CalendarEntry): string {
  return formatTimeRange(e.start_at, e.end_at, e.timezone, lang.value);
}
function timeParts(e: CalendarEntry): [string, string] {
  const [start = "", end = ""] = timeOf(e).split("–");
  return [start.trim(), end.trim()];
}

// ── "+" add choice ───────────────────────────────────────────────────────────

const showAddChoice = ref(false);
const addPrefillStart = ref<string | null>(null);
/** The clicked slot as wall time — a booking keeps it in the clinic's zone (CORE-120). */
const addPrefillWall = ref<string | null>(null);

function openAddChoice(prefillStartIso?: string, prefillWall?: string) {
  addPrefillStart.value = prefillStartIso ?? null;
  addPrefillWall.value = prefillWall ?? null;
  showAddChoice.value = true;
}

/** A click on an event bubbles up to its slot too — that one opens the event/appointment, not the add choice. */
function isEventClick(args: unknown[]): boolean {
  const native = args.find((a): a is Event => a instanceof Event);
  return native?.target instanceof Element && !!native.target.closest(".v-event, .v-event-timed, .cal-event");
}

function onSlotClick(...args: unknown[]) {
  if (isEventClick(args)) return;
  const scope = args.find((a) => a && typeof a === "object" && !(a instanceof Event)) as { date?: string; time?: string } | undefined;
  if (!scope?.date || !scope.time) return;
  const [h, m] = scope.time.split(":").map(Number);
  const rounded = `${scope.date}T${String(h).padStart(2, "0")}:${(m ?? 0) < 30 ? "00" : "30"}`;
  openAddChoice(zonedInputToIso(rounded, deviceTimeZone()), rounded);
}

function defaultStart(): string {
  if (addPrefillStart.value) return addPrefillStart.value;
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

// ── encounter dialog (EventForm) ────────────────────────────────────────────

const showEventForm = ref(false);
const eventFormInitial = ref<EventFormInitialData | undefined>(undefined);

function onChooseEvent() {
  showAddChoice.value = false;
  const start = defaultStart();
  const end = new Date(new Date(start).getTime() + 3_600_000).toISOString();
  eventFormInitial.value = { start_at: start, end_at: end };
  showEventForm.value = true;
}

function openEncounter(encounter: PlannerEvent) {
  eventFormInitial.value = {
    id: encounter.id,
    title: encounter.title,
    start_at: encounter.start_at,
    end_at: encounter.end_at,
    type: encounter.type,
    status: encounter.status,
    attendees: encounter.attendees,
    location: encounter.location,
    video_link: encounter.video_link,
    notes: encounter.notes,
    region: encounter.region,
  };
  showEventForm.value = true;
}

async function rejectEventSave(res: Response, done: SubmitDone) {
  const fieldErrors = await fieldErrorsFromResponse(res);
  if (fieldErrors) {
    done(false, fieldErrors);
    return;
  }
  notifications.show(t("user.planner.form.errorSave"), "error", undefined, { icon: "nav-planner" });
  done(false);
}

async function onEventFormSubmit(payload: EventSubmitPayload, done: SubmitDone) {
  try {
    if (payload.id) {
      const res = await apiFetch(`/api/v1/encounter/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEncounterBody(payload)),
        handleErrors: false,
      });
      if (res.ok) {
        notifications.show(t("user.planner.form.editSuccess"), "success", undefined, { icon: "nav-planner" });
        await fetchItems();
        done(true);
      } else {
        await rejectEventSave(res, done);
      }
    } else {
      const res = await apiFetch("/api/v1/encounter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toEncounterBody(payload)),
        handleErrors: false,
      });
      if (res.ok) {
        notifications.show(t("user.planner.form.success"), "success", undefined, { icon: "nav-planner" });
        await fetchItems();
        done(true);
      } else {
        await rejectEventSave(res, done);
      }
    }
  } catch (err) {
    reportCaught(err, { where: "CalendarView.onEventFormSubmit" });
    notifications.show(t("user.planner.form.errorSave"), "error", undefined, { icon: "nav-planner" });
    done(false);
  }
}

// ── appointment dialogs (AppointmentDialog / AppointmentDetailDialog) ──────

const showBooking = ref(false);
const bookingAppointment = ref<Appointment | null>(null);
const bookingPatient = ref<{ id: string; name: string; practitioner_id?: string | null } | null>(null);
const bookingPractitioner = ref<{ id: string; name: string } | null>(null);
const bookingStart = ref<string | null>(null);
const bookingStartLocal = ref<string | null>(null);
const showDetail = ref(false);
const selectedAppointment = ref<Appointment | null>(null);

function openBooking(opts: { start?: string | null; startLocal?: string | null; appointment?: Appointment | null; patient?: typeof bookingPatient.value; practitioner?: typeof bookingPractitioner.value } = {}) {
  bookingAppointment.value = opts.appointment ?? null;
  bookingPatient.value = opts.patient ?? null;
  bookingPractitioner.value = opts.practitioner ?? null;
  bookingStart.value = opts.start ?? null;
  bookingStartLocal.value = opts.startLocal ?? null;
  showBooking.value = true;
}

function onChooseAppointment() {
  showAddChoice.value = false;
  openBooking({ start: addPrefillStart.value ?? undefined, startLocal: addPrefillWall.value });
}

function openDetail(appointment: Appointment) {
  selectedAppointment.value = appointment;
  showDetail.value = true;
}

function onAppointmentSaved() {
  void fetchItems();
}
function onAppointmentChanged(appointment: Appointment) {
  selectedAppointment.value = appointment;
  void fetchItems();
}
function onReschedule(appointment: Appointment) {
  showDetail.value = false;
  openBooking({ appointment });
}
function onBookNext(appointment: Appointment) {
  showDetail.value = false;
  openBooking({
    patient: { id: appointment.patient_id, name: appointment.patient_name ?? "", practitioner_id: appointment.practitioner_id },
    practitioner: { id: appointment.practitioner_id, name: appointment.practitioner_name ?? "" },
    start: new Date(new Date(appointment.start_at).getTime() + 7 * 86_400_000).toISOString(),
  });
}

// ── dispatch a click on an item to its own dialog ───────────────────────────

function onEntryClick(entry: CalendarEntry) {
  if (entry.kind === "appointment" && entry.appointment) openDetail(entry.appointment);
  else if (entry.kind === "encounter" && entry.encounter) openEncounter(entry.encounter);
}

function onEventClick(...args: unknown[]) {
  const scope = args.find((a) => a && typeof a === "object" && !(a instanceof Event)) as { event?: { id?: string } } | undefined;
  const id = scope?.event?.id;
  const entry = entries.value.find((e) => e.id === id);
  if (entry) onEntryClick(entry);
}
</script>

<style scoped>
.view-calendar {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px;
  gap: 16px;
}

.view-calendar__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}

.view-calendar__view-toggle {
  background: var(--pwa-bg-secondary, rgba(var(--v-theme-on-surface), 0.04));
  padding: 4px;
  gap: 0;
  box-shadow: none;
  border: none;

  :deep(.v-btn) {
    text-transform: none;
    font-weight: 500;
  }
}

.view-calendar__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-calendar__nav-btn {
  min-width: var(--pwa-btn-min-width, 44px);
  min-height: var(--pwa-btn-min-height, 44px);
}

.view-calendar__today {
  min-width: 80px;
  min-height: var(--pwa-btn-min-height, 44px);
}

.view-calendar__period {
  margin-left: 8px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.view-calendar__add {
  margin-left: auto;
  min-width: 44px;
  min-height: 44px;
  border: none;
  box-shadow: none;
  background: transparent;
  color: var(--pwa-text, currentColor);

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

.view-calendar__add-icon {
  width: 20px;
  height: 20px;
  display: block;
  color: inherit;
}

/* Phone: the period gets its own line under the arrows instead of wrapping mid-date. */
@media (max-width: 599px) {
  .view-calendar__nav {
    flex-wrap: wrap;
  }

  .view-calendar__period {
    flex-basis: 100%;
    margin-left: 0;
    padding-inline: 4px;
  }
}

.view-calendar__calendar {
  flex: 1 1 auto;
  min-height: 420px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
}

.view-calendar__weekday {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-calendar__calendar :deep(.v-event-timed) {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none;
  padding: 0 1px;
  overflow: hidden;
}

/* Apple Calendar look, shared by both kinds: tinted block, a left bar, name then time. */
.cal-event {
  display: flex;
  flex-direction: column;
  gap: 1px;
  height: 100%;
  box-sizing: border-box;
  padding: 3px 6px 3px 7px;
  border-left: 3px solid var(--cal-color);
  border-radius: 5px;
  background: color-mix(in srgb, var(--cal-color) 16%, rgb(var(--v-theme-surface)));
  color: color-mix(in srgb, var(--cal-color) 62%, rgb(var(--v-theme-on-surface)));
  font-size: 0.75rem;
  line-height: 1.25;
  cursor: pointer;
  overflow: hidden;
}

.cal-event:hover {
  background: color-mix(in srgb, var(--cal-color) 24%, rgb(var(--v-theme-surface)));
}

.cal-event__title {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-weight: 600;
}

.cal-event__kind-icon {
  flex: none;
  width: 12px;
  height: 12px;
}

.cal-event__name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cal-event__meta {
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cal-event--cancelled .cal-event__title {
  text-decoration: line-through;
}

.appt-response {
  margin-inline-start: 4px;
  font-size: 14px;
  vertical-align: -2px;
  flex: none;
}

.appt-response--confirmed {
  color: rgb(var(--v-theme-success));
}

.appt-response--cannot_attend {
  color: rgb(var(--v-theme-warning));
}

.appt-response--awaiting {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* Agenda list */
.view-calendar__list {
  display: grid;
  gap: 20px;
}

.view-calendar__day {
  display: grid;
  gap: 4px;
}

.view-calendar__day-title {
  margin: 0 0 4px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-calendar__row {
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

.view-calendar__row:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.view-calendar__row--cancelled .view-calendar__row-title {
  text-decoration: line-through;
  opacity: 0.6;
}

.view-calendar__row-time {
  display: grid;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  font-size: 0.875rem;
  white-space: nowrap;
}

.view-calendar__row-end {
  font-weight: 400;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.view-calendar__row-main {
  display: grid;
  min-width: 0;
}

.view-calendar__row-title {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: 500;
}

.view-calendar__row-kind-icon {
  flex: none;
  width: 14px;
  height: 14px;
}

.view-calendar__row-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.view-calendar__row-meta {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* "+" choice dialog */
.view-calendar__choice-list {
  padding-top: 0;
  padding-bottom: 8px;
}

.view-calendar__choice-icon {
  width: 22px;
  height: 22px;
}
</style>
