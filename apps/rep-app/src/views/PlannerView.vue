<template>
  <div class="view-planner">
    <div class="view-planner__toolbar">
      <div class="view-planner__view-toggle">
        <VBtnToggle
          v-model="calendarType"
          mandatory
          density="comfortable"
          variant="flat"
          color="primary"
          rounded="lg"
          class="view-planner__view-toggle-group"
        >
          <VBtn value="day" size="small">{{ t('rep.planner.viewDay') }}</VBtn>
          <VBtn value="week" size="small">{{ t('rep.planner.viewWeek') }}</VBtn>
          <VBtn value="month" size="small">{{ t('rep.planner.viewMonth') }}</VBtn>
        </VBtnToggle>
      </div>
      <div class="view-planner__nav">
        <VBtn icon variant="flat" size="small" class="view-planner__nav-btn" :title="t('rep.planner.prev')" :aria-label="t('rep.planner.prev')" @click="prev">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </VBtn>
        <VBtn variant="text" size="small" class="view-planner__today" @click="goToToday">
          {{ t('rep.planner.today') }}
        </VBtn>
        <VBtn icon variant="flat" size="small" class="view-planner__nav-btn" :title="t('rep.planner.next')" :aria-label="t('rep.planner.next')" @click="next">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </VBtn>
      </div>
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <VBtn
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            class="view-planner__add"
            :aria-label="t('rep.planner.add')"
            @click="onAdd"
          >
            <svg class="view-planner__add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </VBtn>
        </template>
        <span>{{ t('rep.planner.add') }}</span>
      </VTooltip>
    </div>

    <VCalendar
      v-model="calendarValue"
      :type="calendarType"
      :events="calendarEvents"
      :first-interval="8"
      :interval-count="18"
      :interval-minutes="30"
      :weekdays="[0, 1, 2, 3, 4, 5, 6]"
      class="view-planner__calendar"
      @click:date="onDateClick"
      @click:day="onDateClick"
      @click:event="onEventClick"
    >
      <template #day-header="scope">
        <span class="view-planner__weekday">{{ formatWeekday(scope) }}</span>
      </template>
    </VCalendar>

    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { bffFetch } from "../composables/useBffApi";
import { useNotifications } from "../composables/useNotifications";
import EventForm from "../components/EventForm.vue";
import type { EventFormInitialData } from "../components/EventForm.vue";
import type { EventSubmitPayload } from "../components/EventForm.vue";

const { t } = useI18n();
const notifications = useNotifications();

const calendarType = ref<"day" | "week" | "month">("week");
const calendarValue = ref(new Date());
const showEventForm = ref(false);
const eventFormInitial = ref<EventFormInitialData | undefined>(undefined);

interface ApiEvent {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  type: string;
  status: string;
  location?: string;
  video_link?: string;
  notes?: string;
  region?: string;
  attendees?: { attendee_type: string; attendee_id: string }[];
}

const apiEvents = ref<ApiEvent[]>([]);
const loadingEvents = ref(false);

/** VCalendar events format: { id, name, start, end, color } */
const calendarEvents = computed(() =>
  apiEvents.value.map((e) => ({
    id: e.id,
    name: e.title || t("rep.planner.form.fieldTitle"),
    start: toCalendarDateTime(e.start_at),
    end: toCalendarDateTime(e.end_at),
    color: e.status === "cancelled" ? "grey" : e.type === "video" ? "secondary" : "primary",
  }))
);

function toCalendarDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getDateRange(): { start: string; end: string } {
  const v = calendarValue.value;
  const type = calendarType.value;
  let start: Date;
  let end: Date;
  if (type === "week") {
    const day = v.getDay();
    const diff = v.getDate() - day + (day === 0 ? -6 : 1);
    start = new Date(v);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (type === "day") {
    start = new Date(v);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else {
    start = new Date(v.getFullYear(), v.getMonth(), 1);
    end = new Date(v.getFullYear(), v.getMonth() + 1, 1);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

async function fetchEvents() {
  loadingEvents.value = true;
  try {
    const { start, end } = getDateRange();
    const res = await bffFetch(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, {
      errorMessageKey: "rep.planner.form.errorLoad",
    });
    if (res.ok) {
      const json = (await res.json()) as { items?: ApiEvent[] };
      apiEvents.value = json.items ?? [];
    }
  } finally {
    loadingEvents.value = false;
  }
}

watch(
  [calendarValue, calendarType],
  () => fetchEvents(),
  { immediate: true }
);

function prev() {
  const d = new Date(calendarValue.value);
  if (calendarType.value === "day") d.setDate(d.getDate() - 1);
  else if (calendarType.value === "week") d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  calendarValue.value = d;
}

function next() {
  const d = new Date(calendarValue.value);
  if (calendarType.value === "day") d.setDate(d.getDate() + 1);
  else if (calendarType.value === "week") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  calendarValue.value = d;
}

function goToToday() {
  calendarValue.value = new Date();
}

function formatWeekday(scope: { weekday?: number; date?: string }): string {
  let w = scope?.weekday;
  if (w == null && scope?.date) {
    const d = new Date(scope.date + "T12:00:00");
    w = d.getDay();
  }
  if (w == null || w < 0 || w > 6) return "—";
  const key = `rep.planner.weekday${w}`;
  const translated = t(key);
  return translated !== key ? translated : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w];
}

function parseDateFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const date = p.date;
  if (typeof date === "string") return date;
  if (date && typeof date === "object" && "date" in date) {
    return String((date as { date: string }).date);
  }
  return null;
}

function openAddFormForDate(dateStr: string) {
  const date = dateStr.includes(" ") ? dateStr : `${dateStr} 09:00`;
  const startDate = new Date(date);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  eventFormInitial.value = { start_at: startDate.toISOString(), end_at: endDate.toISOString() };
  showEventForm.value = true;
}

function onDateClick(payload: unknown) {
  const dateStr = parseDateFromPayload(payload);
  openAddFormForDate(dateStr || new Date().toISOString().slice(0, 10));
}

function onEventClick(payload: unknown) {
  const p = payload as { event?: { id?: string } };
  const eventId = p.event?.id;
  if (!eventId) return;
  const apiEvent = apiEvents.value.find((e) => e.id === eventId);
  if (!apiEvent) return;
  eventFormInitial.value = {
    id: apiEvent.id,
    title: apiEvent.title,
    start_at: apiEvent.start_at,
    end_at: apiEvent.end_at,
    type: apiEvent.type as "f2f" | "video",
    status: apiEvent.status,
    attendees: apiEvent.attendees,
    location: apiEvent.location,
    video_link: apiEvent.video_link,
    notes: apiEvent.notes,
    region: apiEvent.region,
  };
  showEventForm.value = true;
}

function onAdd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(payload: EventSubmitPayload) {
  try {
    if (payload.id) {
      const res = await bffFetch(`/api/events/${payload.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          start_at: payload.start_at,
          end_at: payload.end_at,
          type: payload.type,
          status: payload.status,
          location: payload.location,
          video_link: payload.video_link,
          notes: payload.notes,
          region: payload.region,
          attendees: payload.attendees,
        }),
      });
      if (res.ok) {
        notifications.show(t("rep.planner.form.editSuccess"), "success");
        await fetchEvents();
      } else {
        notifications.show(t("rep.planner.form.errorSave"), "error");
      }
    } else {
      const res = await bffFetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: payload.title,
          start_at: payload.start_at,
          end_at: payload.end_at,
          type: payload.type,
          status: payload.status,
          location: payload.location,
          video_link: payload.video_link,
          notes: payload.notes,
          region: payload.region,
          attendees: payload.attendees,
        }),
      });
      if (res.ok) {
        notifications.show(t("rep.planner.form.success"), "success");
        await fetchEvents();
      } else {
        notifications.show(t("rep.planner.form.errorSave"), "error");
      }
    }
  } catch {
    notifications.show(t("rep.planner.form.errorSave"), "error");
  }
}
</script>

<style lang="scss" scoped>
.view-planner {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px;
}

.view-planner__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.view-planner__view-toggle {
  flex-shrink: 0;
}

/* Segmented control: pill container (grey), selected segment (white + primary border). */
.view-planner__view-toggle-group {
  background: var(--rep-bg-secondary, rgba(var(--v-theme-on-surface), 0.04));
  border-radius: var(--rep-radius, 10px);
  padding: 4px;
  gap: 0;
  box-shadow: none;
  border: none;

  :deep(.v-btn) {
    text-transform: none;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    background: transparent;
    border: 1px solid transparent;
    box-shadow: none;
    border-radius: 0;

    &:first-child {
      border-radius: 6px 0 0 6px;
    }
    &:last-child {
      border-radius: 0 6px 6px 0;
    }
    &:only-child {
      border-radius: 6px;
    }

    &:hover {
      color: rgba(var(--v-theme-on-surface), 0.87);
      background: rgba(var(--v-theme-on-surface), 0.04);
    }
  }

  :deep(.v-btn--selected),
  :deep(.v-btn[aria-pressed="true"]) {
    background: var(--rep-bg, rgb(var(--v-theme-surface)));
    color: var(--rep-text, rgba(var(--v-theme-on-surface), 0.87));
    border-color: var(--rep-primary, rgb(var(--v-theme-primary)));
    box-shadow: none;
  }
}

.view-planner__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.view-planner__nav-btn {
  min-width: 36px;
  min-height: 36px;

  @media (max-width: 767px) {
    min-width: var(--rep-btn-min-width, 44px);
    min-height: var(--rep-btn-min-height, 44px);
  }
}

.view-planner__today {
  min-width: 80px;

  @media (max-width: 767px) {
    min-height: var(--rep-btn-min-height, 44px);
  }
}

.view-planner__add {
  margin-left: auto;
  min-width: 44px;
  min-height: 44px;
  border: none;
  box-shadow: none;
  background: transparent;
  color: var(--rep-text, currentColor);

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
  }
}

.view-planner__add-icon {
  width: 24px;
  height: 24px;
  display: block;
  color: inherit;
}

.view-planner__calendar {
  flex: 1 1 auto;
  min-height: 400px;
  border-radius: var(--rep-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  overflow: hidden;
}

.view-planner__weekday {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
