<template>
  <!-- CORE-122: Calendario modelled on macOS / iOS Calendar — day, week and month views, a floating
       liquid-glass toolbar, a sidebar (mini month + calendars) that folds into a glass panel on narrow
       screens, and View Transitions between views (zoom) and periods (slide). -->
  <div
    ref="rootEl"
    class="view-calendar cal"
    :class="{ 'cal--narrow': narrow, 'cal--phone': phone, 'cal--side-open': sideOpen, 'cal--no-side': !showSide, 'cal--day-pinned': pinnedShown }"
    :style="{ '--cal-top': `${toolbarBottom}px` }"
  >
    <aside v-show="showSide" class="cal__side" data-testid="calendar-sidebar" :aria-hidden="narrow && !sideOpen ? 'true' : undefined" :inert="narrow && !sideOpen ? true : undefined">
      <CalendarMiniMonth
        :month="miniMonth"
        :today="today"
        :range-start="calendarType === 'month' ? null : windowOf().start"
        :range-days="calendarType === 'day' ? 1 : 7"
        :locale="lang"
        @pick="onMiniPick"
        @shift="(dir) => (miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + dir, 1))"
      />
      <section class="cal__filters">
        <h3 class="cal__filters-title">{{ t("user.calendar.calendars") }}</h3>
        <label v-for="kind in KINDS" :key="kind" class="cal__filter" :style="{ '--cal-color': KIND_COLOR[kind] }">
          <input v-model="visibleKinds[kind]" type="checkbox" class="cal__check" :data-testid="`calendar-filter-${kind}`" />
          <span>{{ t(`user.calendar.filter.${kind}`) }}</span>
          <span class="cal__filter-count">{{ shownEntries.filter((e) => e.kind === kind).length }}</span>
        </label>
      </section>
    </aside>

    <div ref="mainEl" class="cal__main">
      <div
        ref="bodyEl"
        class="cal__body"
        :class="`cal__body--${calendarType}`"
        @pointerdown="onSwipeStart"
        @pointerup="onSwipeEnd"
        @pointercancel="onSwipeCancel"
        @scroll.passive="dayPopover = null"
      >
        <AppErrorState v-if="loadFailed" class="cal__error" :error="loadFailure" :refresh-label="t('app.errorState.refresh')" :loading="loading" @refresh="fetchItems" />

        <CalendarTimeGrid
          v-else-if="calendarType !== 'month'"
          :days="gridDays"
          :events="gridEvents"
          :today="today"
          :now-minutes="nowMinutes"
          :locale="lang"
          :compact="phone"
          data-testid="calendar-grid"
          @open="onOpen"
          @slot="onSlot"
          @day="(day, el) => navigate('day', day, el)"
        />

        <template v-else>
          <CalendarMonthGrid
            :cells="monthCells(calendarValue)"
            :month="calendarValue.getMonth()"
            :events="gridEvents"
            :today="today"
            :selected="selectedDay"
            :locale="lang"
            :compact="phone"
            data-testid="calendar-month"
            :fold-week="phoneFoldWeek"
            @open="onOpen"
            @select="onDaySelect"
          />
          <!-- Phone: the selected day's entries under the month, like iOS Calendar; scrolling the list
               folds the month to the selected week (CORE-161). -->
          <div v-if="phone" ref="agendaEl" class="cal__agenda" :class="{ 'cal__agenda--folded': phoneFoldWeek != null }" @scroll.passive="onAgendaScroll">
            <CalendarDayList mode="inline" :label="selectedDayLabel" :events="selectedDayEvents" @open="onOpen" />
          </div>
        </template>
      </div>

      <!-- CORE-161: tablet/desktop — the clicked day's list as a glass popover by the day, or pinned on the right. -->
      <CalendarDayList
        v-if="pinnedShown"
        class="cal__day-pinned cal-glass"
        mode="pinned"
        can-pin
        :label="selectedDayLabel"
        :events="selectedDayEvents"
        data-testid="calendar-day-pinned"
        @open="onOpen"
        @add="onDayAdd"
        @open-day="onOpenDay"
        @pin="onPin"
      />
      <CalendarDayList
        v-else-if="dayPopover"
        ref="popoverEl"
        class="cal__day-pop cal-glass"
        mode="popover"
        :can-pin="canPin"
        :label="selectedDayLabel"
        :events="selectedDayEvents"
        :style="dayPopoverStyle"
        data-testid="calendar-day-popover"
        @open="onOpen"
        @add="onDayAdd"
        @open-day="onOpenDay"
        @close="dayPopover = null"
        @pin="onPin"
      />

      <!-- After the body in the DOM so its View Transition snapshot paints above the sliding grid. -->
      <div ref="toolbarEl" class="cal__toolbar cal-glass">
        <button
          v-if="narrow && showSide"
          type="button"
          class="cal__icon-btn cal__side-toggle"
          :aria-label="t('user.calendar.toggleSidebar')"
          :aria-expanded="sideOpen"
          data-testid="calendar-sidebar-toggle"
          @click="sideOpen = !sideOpen"
        >
          <AppIcon name="calendar" />
        </button>
        <!-- CORE-153: wide screens read ‹ › · month · Hoy … Día/Semana/Mes; the phone places these by grid area. -->
        <div class="cal__nav">
          <button type="button" class="cal__icon-btn" :aria-label="t('user.planner.prev')" data-testid="calendar-prev" @click="step(-1)">
            <AppIcon name="chevron-left" />
          </button>
          <button type="button" class="cal__icon-btn" :aria-label="t('user.planner.next')" data-testid="calendar-next" @click="step(1)">
            <AppIcon name="chevron-right" />
          </button>
        </div>
        <h2 class="cal__title" data-testid="calendar-title">
          <strong>{{ titleParts[0] }}</strong> <span>{{ titleParts[1] }}</span>
        </h2>
        <button type="button" class="cal__today" data-testid="calendar-today" @click="goToday">{{ t("user.planner.today") }}</button>
        <AppSegmentedTabs
          class="cal__seg"
          :aria-label="t('user.calendar.viewSwitch')"
          :model-value="calendarType"
          :options="viewOptions"
          :fit="!phone"
          @update:model-value="(v: string) => navigate(v as CalendarViewType, calendarValue)"
        />
        <!-- CORE-153: on wide screens "+" sits in the page header, where the lists keep theirs. -->
        <Teleport :to="pageHeader.to" defer :disabled="headerAddOff">
          <button
            type="button"
            class="cal__add"
            :class="{ 'cal__add--header': !headerAddOff }"
            data-testid="calendar-add"
            :aria-label="t('user.calendar.add')"
            :title="t('user.calendar.add')"
            @click="openAdd()"
          >
            <AppIcon name="plus" />
          </button>
        </Teleport>
        <VProgressLinear v-if="loading" indeterminate absolute location="bottom" height="2" color="primary" class="cal__progress" />
      </div>

      <div v-if="narrow && sideOpen" class="cal__scrim" @click="sideOpen = false" />
    </div>

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
import { AppSegmentedTabs } from "@ui";
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { useRoute, useRouter } from "vue-router";
import { intlLocale } from "@i18n/language-options";
import { apiFetch } from "../composables/useApi";
import { useAppointments, type Appointment } from "../composables/useAppointments";
import { fromEncounter, type PlannerEvent } from "../utils/encounterMapping";
import { toZonedCalendarDateTime, deviceTimeZone, zonedInputToIso } from "../utils/appointmentTime";
import {
  MINUTES_PER_DAY,
  calendarMotion,
  capitalizeFirst,
  dateKey,
  fetchWindow,
  inWindow,
  monthCells,
  parseWallTime,
  startOfDay,
  stepAnchor,
  viewWindow,
  weekDays,
  type CalendarMotion,
  type CalendarViewType,
} from "../utils/calendarLayout";
import { useEventSave } from "../composables/useEventSave";
import { usePageHeaderTeleport } from "../composables/usePageHeader";
import type { SubmitDone } from "../composables/useEntitySubmit";
import type { EventFormInitialData, EventSubmitPayload } from "../components/EventForm.vue";
import AppIcon, { type AppIconName } from "../components/AppIcon.vue";
import AppErrorState from "../components/AppErrorState.vue";
import CalendarTimeGrid from "../components/calendar/CalendarTimeGrid.vue";
import CalendarMonthGrid from "../components/calendar/CalendarMonthGrid.vue";
import CalendarMiniMonth from "../components/calendar/CalendarMiniMonth.vue";
import CalendarDayList from "../components/calendar/CalendarDayList.vue";
import { usePersistedState } from "@prefs";
import type { CalendarGridEvent } from "../components/calendar/calendarTypes";
import { appointmentEntry, clockLabel, encounterEntry, toGridEvent, type CalendarEntry, type CalendarItemKind } from "../components/calendar/calendarEntries";

const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
const AppointmentDialog = defineAsyncComponent(() => import("../components/AppointmentDialog.vue"));
const AppointmentDetailDialog = defineAsyncComponent(() => import("../components/AppointmentDetailDialog.vue"));

const { t, locale } = useI18n();
const { smAndUp } = useDisplay();
const { isDoctor } = useAppointments();

const lang = computed(() => intlLocale(locale.value));

const VIEWS: readonly CalendarViewType[] = ["day", "week", "month"];
const VIEW_LABEL: Record<CalendarViewType, string> = { day: "user.planner.viewDay", week: "user.planner.viewWeek", month: "user.planner.viewMonth" };
/** CORE-135: the shared segmented control — this calendar's look is now everyone's. */
const viewOptions = computed(() => VIEWS.map((v) => ({ value: v, label: t(VIEW_LABEL[v]), attrs: { "data-testid": `calendar-view-${v}` } })));

/** Container widths (not the window's): the sidebar folds below NARROW_PX, the phone layout starts below PHONE_PX. */
const NARROW_PX = 900;
const PHONE_PX = 600;
/** Mini month + calendars are hidden on tablet and desktop for now; a phone still opens them from the toolbar. */
const SIDEBAR_ON_WIDE = false;
/** Grid starts scrolled to 07:00; the whole day stays reachable. */
const FIRST_VISIBLE_HOUR = 7;
/** Longest a period change waits for its data before the slide starts (the screen is frozen meanwhile). */
const TRANSITION_FETCH_WAIT_MS = 350;

/**
 * Default: a doctor starts on their day, other staff on the week; a phone
 * starts on the month with today's list under it (the old agenda's job).
 */
const calendarType = ref<CalendarViewType>(!smAndUp.value ? "month" : isDoctor.value ? "day" : "week");
const calendarValue = ref(startOfDay(new Date()));
const selectedDay = ref(startOfDay(new Date()));
const miniMonth = ref(new Date(calendarValue.value.getFullYear(), calendarValue.value.getMonth(), 1));

// ── container size → layout ────────────────────────────────────────────────

const rootEl = ref<HTMLElement | null>(null);
const bodyEl = ref<HTMLElement | null>(null);
const toolbarEl = ref<HTMLElement | null>(null);
const containerWidth = ref(smAndUp.value ? 1200 : 400);
const narrow = computed(() => containerWidth.value < NARROW_PX);
const pageHeader = usePageHeaderTeleport();
const phone = computed(() => containerWidth.value < PHONE_PX);
/** The phone bar keeps its own "+" (it is that screen's only header); elsewhere it moves to the page header. */
const headerAddOff = computed(() => phone.value || pageHeader.disabled.value);
const showSide = computed(() => SIDEBAR_ON_WIDE || phone.value);
const sideOpen = ref(false);
const toolbarBottom = ref(72);

function measure() {
  if (rootEl.value) containerWidth.value = rootEl.value.clientWidth || containerWidth.value;
  if (toolbarEl.value) toolbarBottom.value = toolbarEl.value.offsetTop + toolbarEl.value.offsetHeight + 6;
}

let resizeObserver: ResizeObserver | null = null;
const today = ref(startOfDay(new Date()));
const nowMinutes = ref(0);
function tick() {
  const now = new Date();
  today.value = startOfDay(now);
  nowMinutes.value = now.getHours() * 60 + now.getMinutes();
}
tick();
const clock = setInterval(tick, 60_000);

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(measure);
    if (rootEl.value) resizeObserver.observe(rootEl.value);
    if (toolbarEl.value) resizeObserver.observe(toolbarEl.value);
  }
  scrollToMorning();
  window.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onDocPointerDown, true);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  clearInterval(clock);
  window.removeEventListener("keydown", onKey);
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});
watch([narrow, showSide], ([isNarrow, hasSide]) => {
  if (!isNarrow || !hasSide) sideOpen.value = false;
});
watch([calendarType, phone, narrow, locale], () => void nextTick(measure), { flush: "post" });

// ── data: the union list ────────────────────────────────────────────────────

const KINDS: readonly CalendarItemKind[] = ["appointment", "encounter"];
const KIND_COLOR: Record<CalendarItemKind, string> = { appointment: "#128F83", encounter: "#F59E0B" };
const visibleKinds = reactive<Record<CalendarItemKind, boolean>>({ appointment: true, encounter: true });

interface CalendarItemDto {
  kind: CalendarItemKind;
  id: string;
  start_at: string;
  end_at: string | null;
  data: Record<string, unknown>;
}

const entries = ref<CalendarEntry[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const loadFailure = ref<unknown>(null);

function toEntry(item: CalendarItemDto): CalendarEntry {
  if (item.kind === "encounter") return encounterEntry(fromEncounter(item.data as Parameters<typeof fromEncounter>[0]), t("user.planner.form.fieldTitle"));
  return appointmentEntry(item.data as unknown as Appointment);
}

function windowOf(): { start: Date; end: Date } {
  return viewWindow(calendarType.value, calendarValue.value);
}

/** Latest request wins: a slow answer for a week already left behind is dropped. */
let requestSeq = 0;
let pendingFetch: Promise<void> = Promise.resolve();

function fetchItems(): Promise<void> {
  const seq = ++requestSeq;
  pendingFetch = (async () => {
    loading.value = true;
    loadFailed.value = false;
    try {
      const { start, end } = fetchWindow(calendarType.value, calendarValue.value);
      const res = await apiFetch(`/api/v1/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`, {
        handleErrors: false,
      });
      if (!res.ok) throw new Error(`GET /calendar ${res.status}`);
      const items = ((await res.json()) as { items?: CalendarItemDto[] }).items ?? [];
      if (seq === requestSeq) entries.value = items.map(toEntry);
    } catch (err) {
      if (seq !== requestSeq) return;
      reportCaught(err, { where: "CalendarView.fetchItems" });
      loadFailed.value = true;
      loadFailure.value = err;
    } finally {
      if (seq === requestSeq) loading.value = false;
    }
  })();
  return pendingFetch;
}
watch(() => [calendarType.value, dateKey(windowOf().start)], () => void fetchItems(), { immediate: true });

// ── what the grids draw ─────────────────────────────────────────────────────

/** The fetched entries whose wall-clock day is on screen — the fetch is padded (CORE-139). */
const shownEntries = computed(() => {
  const window = windowOf();
  return entries.value.filter((e) => inWindow(parseWallTime(toZonedCalendarDateTime(e.start_at, e.timezone)).key, window));
});

const gridEvents = computed<CalendarGridEvent[]>(() => {
  const now = Date.now();
  return shownEntries.value
    .filter((e) => !showSide.value || visibleKinds[e.kind])
    .map((e) => toGridEvent(e, now));
});

const gridDays = computed(() => (calendarType.value === "day" ? [calendarValue.value] : weekDays(calendarValue.value)));

const selectedDayEvents = computed(() => {
  const key = dateKey(selectedDay.value);
  return gridEvents.value.filter((e) => e.dayKey === key).sort((a, b) => a.startMin - b.startMin);
});
const selectedDayLabel = computed(() => capitalizeFirst(new Intl.DateTimeFormat(lang.value, { weekday: "long", day: "numeric", month: "long" }).format(selectedDay.value)));

// ── CORE-161: the clicked day's list ────────────────────────────────────────
// Tablet/desktop: a glass popover by the day, or (pinned) a panel on the right that follows the
// selected day. Phone: the list under the month; scrolling it folds the month to the selected week.

/** Popover / pinned panel width; the pin needs a wide screen so the month keeps usable columns. */
const DAY_LIST_WIDTH = 304;
/** Gap between the clicked cell and the popover, and the popover's distance to the edges. */
const DAY_POP_GAP = 8;
/** Where "+" in the day list puts a new booking on that day. */
const DAY_ADD_MINUTES = 9 * 60;

const mainEl = ref<HTMLElement | null>(null);
const popoverEl = ref<InstanceType<typeof CalendarDayList> | null>(null);
const agendaEl = ref<HTMLElement | null>(null);
const dayPopover = ref<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
const dayListPinned = usePersistedState<boolean>("view:calendar:dayListPinned", false);
const canPin = computed(() => !narrow.value);
const pinnedShown = computed(() => calendarType.value === "month" && canPin.value && dayListPinned.value);
const agendaFolded = ref(false);

const dayPopoverStyle = computed(() => {
  const p = dayPopover.value;
  if (!p) return undefined;
  const px = (n: number | undefined) => (n === undefined ? undefined : `${Math.round(n)}px`);
  return { left: px(p.left), width: px(p.width), top: px(p.top), bottom: px(p.bottom), maxHeight: px(p.maxHeight) };
});

/** The selected day's week row (0–5) while the phone list is scrolled; null shows the whole month. */
const phoneFoldWeek = computed(() => {
  if (!phone.value || !agendaFolded.value) return null;
  const index = monthCells(calendarValue.value).findIndex((d) => dateKey(d) === dateKey(selectedDay.value));
  return index < 0 ? null : Math.floor(index / 7);
});

function onDaySelect(day: Date, cell: HTMLElement) {
  selectedDay.value = day;
  if (phone.value || pinnedShown.value) return;
  dayPopover.value = popoverPlacement(cell);
}

/** Centred under the cell, or above it when there is more room there; kept inside the calendar. */
function popoverPlacement(cell: HTMLElement): NonNullable<typeof dayPopover.value> {
  const main = mainEl.value;
  const box = main?.getBoundingClientRect() ?? { left: 0, top: 0, width: DAY_LIST_WIDTH, height: 0, bottom: 0 };
  const r = cell.getBoundingClientRect();
  const width = Math.min(DAY_LIST_WIDTH, box.width - 2 * DAY_POP_GAP);
  const left = Math.min(Math.max(r.left - box.left + r.width / 2 - width / 2, DAY_POP_GAP), box.width - width - DAY_POP_GAP);
  const below = box.bottom - r.bottom - 2 * DAY_POP_GAP;
  const above = r.top - box.top - toolbarBottom.value - 2 * DAY_POP_GAP;
  return below >= above
    ? { left, width, top: r.bottom - box.top + DAY_POP_GAP, maxHeight: Math.max(below, 160) }
    : { left, width, bottom: box.bottom - r.top + DAY_POP_GAP, maxHeight: Math.max(above, 160) };
}

function onPin(on: boolean) {
  dayListPinned.value = on;
  dayPopover.value = null;
}

function onOpenDay() {
  dayPopover.value = null;
  navigate("day", selectedDay.value);
}

function onDayAdd() {
  dayPopover.value = null;
  onSlot(dateKey(selectedDay.value), DAY_ADD_MINUTES);
}

function onAgendaScroll() {
  const top = agendaEl.value?.scrollTop ?? 0;
  if (top > 8) agendaFolded.value = true;
  else if (top <= 0) agendaFolded.value = false;
}

/** A click outside the popover closes it; a click on another day re-anchors it instead (onDaySelect). */
function onDocPointerDown(event: PointerEvent) {
  if (!dayPopover.value) return;
  const target = event.target as Node | null;
  const pop = popoverEl.value?.$el as HTMLElement | undefined;
  if (target && (pop?.contains(target) || (target instanceof Element && target.closest(".cal-mo__cell")))) return;
  dayPopover.value = null;
}

watch([calendarType, calendarValue], () => {
  dayPopover.value = null;
  agendaFolded.value = false;
  if (agendaEl.value) agendaEl.value.scrollTop = 0;
});
watch(narrow, () => (dayPopover.value = null));

/** Toolbar title as [bold, regular] — "Octubre 2026", "4 de octubre 2026", "Domingo 4". */
const titleParts = computed<[string, string]>(() => {
  const d = calendarValue.value;
  const fmt = (o: Intl.DateTimeFormatOptions) => capitalizeFirst(new Intl.DateTimeFormat(lang.value, o).format(d));
  const year = String(d.getFullYear());
  if (calendarType.value === "day") {
    return phone.value ? [fmt({ weekday: "long" }), String(d.getDate())] : [fmt({ day: "numeric", month: "long" }), year];
  }
  if (calendarType.value === "week") {
    const days = weekDays(d);
    const first = days[0]!;
    const last = days[6]!;
    if (first.getMonth() !== last.getMonth()) {
      const short = new Intl.DateTimeFormat(lang.value, { month: "short" });
      return [capitalizeFirst(`${short.format(first).replace(".", "")} – ${short.format(last).replace(".", "")}`), String(last.getFullYear())];
    }
  }
  return [fmt({ month: "long" }), year];
});

// ── navigation + View Transitions ───────────────────────────────────────────

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> } };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToMorning() {
  const body = bodyEl.value;
  if (!body || calendarType.value === "month") return;
  const hourHeight = parseFloat(getComputedStyle(body).getPropertyValue("--cal-hh")) || 52;
  body.scrollTop = hourHeight * FIRST_VISIBLE_HOUR;
  if (phone.value && calendarType.value === "week") {
    const dayIndex = (calendarValue.value.getDay() + 6) % 7;
    const column = body.querySelector<HTMLElement>(".cal-tg__col");
    body.scrollLeft = Math.max(0, dayIndex - 1) * (column?.offsetWidth ?? 0);
  }
}

/** Where a zoom starts from: the clicked date, as % of the grid's box. */
function setZoomOrigin(el: HTMLElement | undefined) {
  const root = document.documentElement;
  const body = bodyEl.value;
  if (!el || !body) {
    root.style.removeProperty("--cal-vt-ox");
    root.style.removeProperty("--cal-vt-oy");
    return;
  }
  const box = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  root.style.setProperty("--cal-vt-ox", `${(((r.left + r.width / 2 - box.left) / box.width) * 100).toFixed(1)}%`);
  root.style.setProperty("--cal-vt-oy", `${(((r.top + r.height / 2 - box.top) / box.height) * 100).toFixed(1)}%`);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function navigate(type: CalendarViewType, date: Date, origin?: HTMLElement) {
  const target = startOfDay(date);
  const motion: CalendarMotion = calendarMotion(calendarType.value, type, calendarValue.value, target);
  const typeChanged = type !== calendarType.value;
  const apply = async () => {
    calendarType.value = type;
    calendarValue.value = target;
    // Paging months lands on the 1st; show today's list instead when today is in that month.
    selectedDay.value = type === "month" && target.getDate() === 1 && sameMonth(today.value, target) ? today.value : target;
    if (!sameMonth(target, miniMonth.value)) {
      miniMonth.value = new Date(target.getFullYear(), target.getMonth(), 1);
    }
    await nextTick();
    if (motion !== "none") {
      await Promise.race([pendingFetch, new Promise((resolve) => setTimeout(resolve, TRANSITION_FETCH_WAIT_MS))]);
      await nextTick();
    }
    if (typeChanged) scrollToMorning();
  };

  const doc = document as ViewTransitionDocument;
  if (motion === "none" || !doc.startViewTransition || prefersReducedMotion()) {
    void apply();
    return;
  }
  setZoomOrigin(origin);
  document.documentElement.dataset.calTransition = motion;
  doc.startViewTransition(apply).finished.finally(() => {
    delete document.documentElement.dataset.calTransition;
  });
}

function step(direction: -1 | 1) {
  navigate(calendarType.value, stepAnchor(calendarType.value, calendarValue.value, direction));
}

function goToday() {
  navigate(calendarType.value, new Date());
}

function onMiniPick(day: Date) {
  navigate(calendarType.value === "month" ? "day" : calendarType.value, day);
  if (narrow.value) sideOpen.value = false;
}

/** Keyboard, as in macOS Calendar: ← → move, T today, 1/2/3 day/week/month. Ignored while typing or in a dialog. */
function onKey(event: KeyboardEvent) {
  if (event.key === "Escape" && dayPopover.value) {
    dayPopover.value = null;
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, textarea, select, [contenteditable='true'], .v-overlay")) return;
  if (showEventForm.value || showBooking.value || showDetail.value) return;
  const byKey: Record<string, () => void> = {
    ArrowLeft: () => step(-1),
    ArrowRight: () => step(1),
    t: goToday,
    T: goToday,
    "1": () => navigate("day", calendarValue.value),
    "2": () => navigate("week", calendarValue.value),
    "3": () => navigate("month", calendarValue.value),
  };
  const action = byKey[event.key];
  if (!action) return;
  event.preventDefault();
  action();
}

/** Phone swipe on the day and month views (the week scrolls sideways itself). */
let swipe: { x: number; y: number; at: number } | null = null;
function onSwipeStart(event: PointerEvent) {
  swipe = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY, at: Date.now() };
}
function onSwipeCancel() {
  swipe = null;
}
function onSwipeEnd(event: PointerEvent) {
  if (!swipe || calendarType.value === "week") return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  const quick = Date.now() - swipe.at < 600;
  swipe = null;
  if (quick && Math.abs(dx) > 60 && Math.abs(dy) < 40) step(dx < 0 ? 1 : -1);
}

// ── a click on the grid ─────────────────────────────────────────────────────

function onOpen(id: string) {
  dayPopover.value = null;
  const entry = entries.value.find((e) => e.id === id);
  if (entry) onEntryClick(entry);
}

function onSlot(dayKey: string, minutes: number) {
  // The clicked time is wall time: an event reads it in the device zone, a booking in the clinic's (CORE-120).
  const wall = `${dayKey}T${clockLabel(minutes)}`;
  openAdd(zonedInputToIso(wall, deviceTimeZone()), wall);
}

// ── "+" add ──────────────────────────────────────────────────────────────────

// "+" and an empty slot always book a Cita for now — doctors schedule their own patients.
// The Cita/Evento choice (CORE-117) comes back when events are needed again.
// prefillWall is the clicked slot as wall time — a booking keeps it in the clinic's zone (CORE-120).
function openAdd(prefillStartIso?: string, prefillWall?: string) {
  openBooking({ start: prefillStartIso, startLocal: prefillWall ?? null });
}

// ── encounter dialog (EventForm) ────────────────────────────────────────────

const showEventForm = ref(false);
const eventFormInitial = ref<EventFormInitialData | undefined>(undefined);


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
    patient_ids: encounter.patient_ids,
  };
  showEventForm.value = true;
}

const saveEvent = useEventSave("CalendarView.onEventFormSubmit");
function onEventFormSubmit(payload: EventSubmitPayload, done: SubmitDone) {
  return saveEvent(payload, done, fetchItems);
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

function openDetail(appointment: Appointment) {
  selectedAppointment.value = appointment;
  showDetail.value = true;
}

// ── deep link: ?appointment=<id> (CORE-4) ───────────────────────────────────
// A notification about a visit links here: load that visit, show its day and
// open its detail. The query is dropped afterwards so closing the dialog and
// reloading doesn't reopen it.
const route = useRoute();
const router = useRouter();

async function openFromLink(id: string) {
  try {
    const res = await apiFetch(`/api/v1/appointments/${encodeURIComponent(id)}`, { handleErrors: false });
    if (!res.ok) return; // gone or out of scope: the calendar alone is the fallback
    const appointment = (await res.json()) as Appointment;
    calendarValue.value = new Date(appointment.start_at);
    openDetail(appointment);
  } catch (err) {
    reportCaught(err, { where: "CalendarView.openFromLink" });
  } finally {
    const rest = { ...route.query };
    delete rest.appointment;
    void router.replace({ query: rest });
  }
}

watch(
  () => route.query.appointment,
  (id) => {
    if (typeof id === "string" && id) void openFromLink(id);
  },
  { immediate: true },
);

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
</script>

<style scoped>
/* Calendar-local tokens on top of the theme; the glass follows the tenant surface colour (NEO-161). */
.cal {
  --cal-hh: 52px;
  --cal-line: rgba(var(--v-theme-on-surface), 0.08);
  --cal-line-strong: rgba(var(--v-theme-on-surface), 0.14);
  --cal-muted: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  --cal-faint: rgba(var(--v-theme-on-surface), 0.42);
  --cal-hover: rgba(var(--v-theme-on-surface), 0.08);
  --cal-hover-soft: rgba(var(--v-theme-on-surface), 0.03);
  --cal-weekend: rgba(var(--v-theme-on-surface), 0.022);
  --cal-frost: color-mix(in srgb, var(--pwa-sheet, rgb(var(--v-theme-surface))) 72%, transparent);
  --cal-glass: color-mix(in srgb, rgb(var(--v-theme-surface)) 60%, transparent);
  --cal-glass-strong: color-mix(in srgb, rgb(var(--v-theme-surface)) 82%, transparent);
  --cal-ev-mix: 16%;
  --cal-ev-ink: 70%;

  position: relative;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 520px;
  margin: calc(-1 * var(--layout-card-inset, 0px));
  margin-top: 0;
  border-top: 0.5px solid var(--cal-line);
  overflow: hidden;
  border-radius: 0 0 var(--pwa-sheet-radius, 16px) var(--pwa-sheet-radius, 16px);
}

:global([data-theme="dark"]) .cal {
  --cal-ev-mix: 24%;
  --cal-ev-ink: 55%;
}

/* ── glass ── */
.cal-glass {
  background: var(--cal-glass);
  -webkit-backdrop-filter: var(--glass-blur, blur(20px) saturate(170%));
  backdrop-filter: var(--glass-blur, blur(20px) saturate(170%));
  box-shadow:
    inset 0 1px 0 var(--glass-edge, rgb(255 255 255 / 0.7)),
    inset 0 0 0 0.5px rgb(255 255 255 / 0.3),
    var(--glass-shadow, 0 12px 32px -10px rgb(16 48 45 / 0.3));
}

/* ── sidebar ── */
.cal__side {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
  overflow-y: auto;
  border-right: 0.5px solid var(--cal-line-strong);
  background: rgba(var(--v-theme-primary), 0.025);
}

.cal__filters-title {
  margin: 0 0 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cal-muted);
}

.cal__filter {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
}

.cal__filter:hover {
  background: var(--cal-hover);
}

.cal__filter-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--cal-faint);
  font-variant-numeric: tabular-nums;
}

.cal__check {
  appearance: none;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 1.5px solid var(--cal-color);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal__check:checked {
  background: var(--cal-color);
}

.cal__check:checked::after {
  content: "";
  width: 7px;
  height: 4px;
  border: 1.6px solid #fff;
  border-top: 0;
  border-right: 0;
  transform: translateY(-1px) rotate(-45deg);
}

.cal__check:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

/* ── main + scroller ── */
.cal__main {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.cal__body {
  position: absolute;
  inset: 0;
  overflow: auto;
  overscroll-behavior: contain;
  view-transition-name: cal-body;
}

.cal__error {
  padding-top: var(--cal-top, 72px);
}

/* ── floating toolbar ── */
.cal__toolbar {
  position: absolute;
  z-index: 20;
  top: 10px;
  left: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 6px 8px 6px 14px;
  border-radius: 18px;
  overflow: hidden;
  view-transition-name: cal-toolbar;
}

.cal__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 1.25rem;
  font-weight: 400;
  letter-spacing: -0.01em;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal__title strong {
  font-weight: 700;
}


.cal__nav {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cal__icon-btn,
.cal__today,
.cal__add {
  display: grid;
  place-items: center;
  min-width: 36px;
  min-height: 36px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal__today {
  padding: 0 12px;
  font-size: 0.8125rem;
  font-weight: 500;
}

.cal__icon-btn:hover,
.cal__today:hover {
  background: var(--cal-hover);
}

.cal__icon-btn :deep(svg),
.cal__add :deep(svg) {
  width: 18px;
  height: 18px;
}

/* The sidebar toggle wears the module's calendar glyph, in the module teal like the page-header icon. */
.cal__side-toggle {
  color: rgb(var(--v-theme-primary));
}

.cal__side-toggle :deep(svg) {
  width: 22px;
  height: 22px;
}

.cal__add {
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 4px 12px -4px rgb(var(--v-theme-primary));
}

/* ── CORE-153: tablet and desktop — a flat line under the page header, not a floating glass bar ── */
.cal:not(.cal--phone) .cal__toolbar.cal-glass {
  top: 0;
  left: 0;
  right: 0;
  gap: 8px;
  padding: 6px 12px 6px 8px;
  border-radius: 0;
  border-bottom: 0.5px solid var(--cal-line);
  background: var(--pwa-sheet, rgb(var(--v-theme-surface)));
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  box-shadow: none;
}

.cal:not(.cal--phone) .cal__title {
  flex: 0 1 auto;
}

.cal:not(.cal--phone) .cal__today {
  min-height: 28px;
  border: 1px solid var(--cal-line-strong);
  border-radius: 8px;
}

.cal:not(.cal--phone) .cal__seg {
  margin-left: auto;
}

/* "+" off the phone wears the lists' add button: plain teal glyph, teal tint on hover (AppEntityList.css).
   --header is the copy teleported into the page header, outside .cal. */
.cal:not(.cal--phone) .cal__add,
.cal__add.cal__add--header {
  flex-shrink: 0;
  min-width: 48px;
  min-height: 48px;
  border-radius: 50%;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  box-shadow: none;
}

.cal:not(.cal--phone) .cal__add:hover,
.cal__add.cal__add--header:hover {
  background: rgba(var(--v-theme-primary), 0.12);
}

.cal:not(.cal--phone) .cal__add :deep(svg),
.cal__add.cal__add--header :deep(svg) {
  width: 22px;
  height: 22px;
}

.cal__icon-btn:focus-visible,
.cal__today:focus-visible,
.cal__add:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.cal__scrim {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: var(--mobile-nav-scrim, rgb(8 20 19 / 0.28));
  animation: cal-fade-in 0.25s ease both;
}

/* ── narrow (tablet): the sidebar floats as a glass panel ── */
.cal--narrow,
.cal--no-side {
  grid-template-columns: minmax(0, 1fr);
}

.cal--narrow .cal__side {
  position: absolute;
  z-index: 35;
  top: var(--cal-top, 72px);
  left: 10px;
  bottom: 10px;
  width: 268px;
  border: 0;
  border-radius: 20px;
  background: var(--cal-glass-strong);
  -webkit-backdrop-filter: var(--glass-blur, blur(20px) saturate(170%));
  backdrop-filter: var(--glass-blur, blur(20px) saturate(170%));
  box-shadow:
    inset 0 1px 0 var(--glass-edge, rgb(255 255 255 / 0.7)),
    var(--glass-shadow, 0 12px 32px -10px rgb(16 48 45 / 0.3));
  opacity: 0;
  pointer-events: none;
  transform: translateX(-110%) scale(0.96);
  transition:
    transform var(--menu-dur-out, 180ms) var(--menu-ease-out, ease),
    opacity var(--menu-dur-out, 180ms);
}

.cal--narrow .cal__side,
.cal--narrow .cal__scrim {
  grid-column: 1;
}

.cal--narrow.cal--side-open .cal__side {
  opacity: 1;
  pointer-events: auto;
  transform: none;
  transition:
    transform var(--menu-dur-in, 420ms) var(--menu-spring, ease),
    opacity 0.2s;
}

/* ── phone: two-row header, scrolling week, month + day list ── */
/* CORE-130: on a phone AppLayout's header row is hidden (CORE-129), so the calendar also takes the
   sheet's top padding and drops its top rule: the glass bar sits 8 px under the sheet's edge. */
.cal--phone {
  --cal-hh: 48px;
  --cal-gutter: 44px;
  --cal-day-min: 92px;
  margin-top: calc(-1 * var(--layout-card-inset, 0px));
  border-top: 0;
  border-radius: var(--pwa-sheet-radius, 16px);
}

/* CORE-129: on a phone this bar is the screen's only header (route meta phoneOwnHeader hides
   AppLayout's row). Row 1: calendar glyph · month · "+" top-right, like other modules' add.
   Row 2: Día/Semana/Mes and the arrows. */
.cal--phone .cal__toolbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    "toggle title add"
    "seg seg nav";
  gap: 8px;
  top: 8px;
  left: 8px;
  right: 8px;
  padding: 8px 8px 8px 8px;
  border-radius: 22px;
}

.cal--phone .cal__side-toggle {
  grid-area: toggle;
}

.cal--phone .cal__title {
  grid-area: title;
  align-self: center;
}

.cal--phone .cal__add {
  grid-area: add;
  justify-self: end;
  border-radius: 10px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  box-shadow: none;
}

.cal--phone .cal__add :deep(svg) {
  width: 22px;
  height: 22px;
}

.cal--phone .cal__nav {
  grid-area: nav;
}

/* Month and day: the browser keeps vertical scrolling, horizontal swipes page the calendar. */
.cal--phone .cal__body--month,
.cal--phone .cal__body--day {
  touch-action: pan-y;
}

.cal--phone .cal__title {
  font-size: 1.375rem;
}

.cal--phone .cal__today {
  display: none;
}

.cal--phone .cal__seg {
  grid-area: seg;
}

.cal--phone .cal__body--week {
  scroll-snap-type: x proximity;
  scroll-padding-left: var(--cal-gutter);
}

.cal--phone .cal__side {
  top: auto;
  left: 8px;
  right: 8px;
  bottom: 8px;
  width: auto;
  max-height: 75%;
  transform: translateY(105%);
}

.cal--phone.cal--side-open .cal__side {
  transform: none;
}

/* CORE-161: on a phone the month stays put and the list under it scrolls; scrolling folds the month. */
.cal--phone .cal__body--month {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cal--phone .cal__body--month > .cal-mo {
  flex: none;
}

.cal__agenda {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 14px 12px 24px;
  border-top: 0.5px solid var(--cal-line-strong);
}

/* Folded, the list always scrolls a little, so it doesn't snap back open when it gets the month's room. */
.cal__agenda--folded > .cal-dl {
  min-height: calc(100% + 40px);
}

/* ── CORE-161: the day list as liquid glass — a popover by the day, or pinned on the right ── */
.cal__day-pop,
.cal__day-pinned {
  position: absolute;
  z-index: 25;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 10px 8px 12px;
  background: var(--cal-glass-strong);
}

.cal__day-pop {
  border-radius: 20px;
  animation: cal-pop-in var(--menu-dur-in, 260ms) var(--menu-spring, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.cal__day-pinned {
  top: calc(var(--cal-top, 72px) + 8px);
  right: 8px;
  bottom: 8px;
  width: 304px;
  border-radius: 20px;
  animation: cal-dock-in var(--menu-dur-in, 320ms) var(--menu-spring, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.cal--day-pinned .cal__body {
  right: 320px;
}

@keyframes cal-pop-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(-4px);
  }
}

@keyframes cal-dock-in {
  from {
    opacity: 0;
    transform: translateX(24px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cal__day-pop,
  .cal__day-pinned {
    animation: none;
  }
}

@keyframes cal-fade-in {
  from {
    opacity: 0;
  }
}
</style>

<style>
/*
 * CORE-122 view-change motion (global: View Transition pseudo-elements live on <html>).
 * <html data-cal-transition="in|out|next|prev">, set by CalendarView.navigate():
 *   in   — month → week → day: the old view grows past the viewer, the new one rises from the clicked date.
 *   out  — the reverse: the old view shrinks away, the new one settles down from slightly larger.
 *   next / prev — a slide with a fade, like paging through a paper planner.
 * The toolbar keeps its own snapshot above the grid and does not move.
 */
/* CORE-165: the overlay ignores .cal__main's overflow, so the group clips the slide/zoom to the grid box itself. */
html[data-cal-transition]::view-transition-group(cal-body) {
  animation-duration: 420ms;
  overflow: clip;
}
html[data-cal-transition]::view-transition-group(cal-toolbar) {
  animation: none;
}
html[data-cal-transition]::view-transition-old(cal-toolbar) {
  display: none;
}
html[data-cal-transition]::view-transition-new(cal-toolbar) {
  animation: none;
}
html[data-cal-transition]::view-transition-old(cal-body),
html[data-cal-transition]::view-transition-new(cal-body) {
  animation-duration: 420ms;
  animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  animation-fill-mode: both;
  transform-origin: var(--cal-vt-ox, 50%) var(--cal-vt-oy, 40%);
}
html[data-cal-transition="next"]::view-transition-old(cal-body) {
  animation-name: cal-out-left;
}
html[data-cal-transition="next"]::view-transition-new(cal-body) {
  animation-name: cal-in-right;
}
html[data-cal-transition="prev"]::view-transition-old(cal-body) {
  animation-name: cal-out-right;
}
html[data-cal-transition="prev"]::view-transition-new(cal-body) {
  animation-name: cal-in-left;
}
html[data-cal-transition="in"]::view-transition-old(cal-body) {
  animation-name: cal-zoom-past;
}
html[data-cal-transition="in"]::view-transition-new(cal-body) {
  animation-name: cal-zoom-rise;
}
html[data-cal-transition="out"]::view-transition-old(cal-body) {
  animation-name: cal-zoom-away;
}
html[data-cal-transition="out"]::view-transition-new(cal-body) {
  animation-name: cal-zoom-settle;
}
@keyframes cal-out-left {
  to { transform: translateX(-18%); opacity: 0; }
}
@keyframes cal-in-right {
  from { transform: translateX(18%); opacity: 0; }
}
@keyframes cal-out-right {
  to { transform: translateX(18%); opacity: 0; }
}
@keyframes cal-in-left {
  from { transform: translateX(-18%); opacity: 0; }
}
@keyframes cal-zoom-past {
  to { transform: scale(1.5); opacity: 0; }
}
@keyframes cal-zoom-rise {
  from { transform: scale(0.55); opacity: 0; }
}
@keyframes cal-zoom-away {
  to { transform: scale(0.6); opacity: 0; }
}
@keyframes cal-zoom-settle {
  from { transform: scale(1.35); opacity: 0; }
}
</style>
