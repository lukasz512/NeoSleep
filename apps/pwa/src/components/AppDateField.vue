<template>
  <div class="app-date-field" :class="{ 'app-date-field--pair pwa-form-row': mode === 'datetime' }" :data-testid="testId">
    <VTextField
      v-if="mode !== 'time'"
      ref="dateInput"
      :model-value="dateText"
      class="app-date-field__date"
      :class="{ 'pwa-form-row-item': mode === 'datetime' }"
      :label="label"
      :placeholder="datePlaceholder"
      :hint="hint"
      :persistent-hint="persistentHint"
      :rules="dateRules"
      :error-messages="errorMessages"
      :variant="variant"
      :density="density"
      :color="color"
      :disabled="disabled"
      inputmode="numeric"
      autocomplete="off"
      data-testid="date-field-date"
      @update:model-value="onDateInput"
      @update:focused="onDateFocus"
    >
      <template #append-inner>
        <button
          type="button"
          class="app-date-field__open"
          :aria-label="t('app.dateField.openCalendar')"
          :disabled="disabled"
          data-testid="date-field-open-calendar"
          @click.stop="dateOpen = true"
        >
          <AppIcon name="calendar" />
        </button>
      </template>
    </VTextField>

    <VTextField
      v-if="mode !== 'date'"
      ref="timeInput"
      :model-value="timeText"
      class="app-date-field__time"
      :class="{ 'pwa-form-row-item': mode === 'datetime' }"
      :label="mode === 'time' ? label : timeLabel ?? t('app.dateField.time')"
      :placeholder="t('app.dateField.timePlaceholder')"
      :rules="timeRules"
      :error-messages="mode === 'time' ? errorMessages : undefined"
      :variant="variant"
      :density="density"
      :color="color"
      :disabled="disabled"
      inputmode="numeric"
      autocomplete="off"
      data-testid="date-field-time"
      @update:model-value="onTimeInput"
      @update:focused="onTimeFocus"
    >
      <template #append-inner>
        <button
          type="button"
          class="app-date-field__open"
          :aria-label="t('app.dateField.openTimes')"
          :disabled="disabled"
          data-testid="date-field-open-times"
          @click.stop="timeOpen = true"
        >
          <AppIcon name="clock" />
        </button>
      </template>
    </VTextField>

    <!-- Calendar: a small card under the field; a bottom sheet on phones. -->
    <component
      :is="isPhone ? VBottomSheet : VMenu"
      v-if="mode !== 'time'"
      v-model="dateOpen"
      v-bind="isPhone ? { class: 'app-date-field-sheet' } : { target: dateTarget, location: 'bottom start', offset: 4, closeOnContentClick: false }"
    >
      <div class="app-date-field__panel" data-testid="date-field-calendar">
        <div v-if="quickPicks.length" class="app-date-field__chips">
          <button
            v-for="q in quickPicks"
            :key="q.key"
            type="button"
            class="app-date-field__chip"
            :disabled="!q.allowed"
            @click="pickIso(q.iso)"
          >{{ t(q.key) }}</button>
        </div>
        <VDatePicker
          v-model:view-mode="viewMode"
          :model-value="pickerDate"
          :min="minDate"
          :max="maxDate"
          :first-day-of-week="1"
          color="primary"
          show-adjacent-months
          hide-header
          width="100%"
          class="app-date-field__picker"
          @update:model-value="onPick"
        />
        <div class="app-date-field__footer">
          <button v-if="dateIso" type="button" class="app-date-field__action app-date-field__action--muted" @click="clearDate">
            {{ t('app.dateField.clear') }}
          </button>
          <span v-else />
          <button type="button" class="app-date-field__action" @click="dateOpen = false">{{ t('app.dateField.close') }}</button>
        </div>
      </div>
    </component>

    <!-- Times: a list of slots every `step` minutes; taken ones are marked. -->
    <component
      :is="isPhone ? VBottomSheet : VMenu"
      v-if="mode !== 'date'"
      v-model="timeOpen"
      v-bind="isPhone ? { class: 'app-date-field-sheet' } : { target: timeTarget, location: 'bottom start', offset: 4, minWidth: timeTarget?.offsetWidth, closeOnContentClick: false }"
    >
      <div class="app-date-field__panel app-date-field__panel--times" data-testid="date-field-times">
        <div ref="slotList" class="app-date-field__slots" role="listbox" :aria-label="t('app.dateField.openTimes')">
          <button
            v-for="s in slots"
            :key="s.time"
            type="button"
            role="option"
            class="app-date-field__slot"
            :class="{ 'is-selected': s.time === time, 'is-busy': s.busy }"
            :aria-selected="s.time === time"
            :disabled="s.disabled"
            :data-time="s.time"
            @click="pickTime(s.time)"
          >
            <span>{{ s.time }}</span>
            <small v-if="s.busy">{{ t('app.dateField.busy') }}</small>
          </button>
        </div>
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { VBottomSheet, VMenu } from "vuetify/components";
import { intlLocale } from "@i18n/language-options";
import AppIcon from "./AppIcon.vue";
import {
  DATE_DIGITS,
  TIME_DIGITS,
  addDaysIso,
  busySlots,
  checkDateDigits,
  checkTimeDigits,
  dateFormatFor,
  formatDateDigits,
  formatTimeDigits,
  isoToDateDigits,
  localIsoDate,
  onlyDigits,
  resolveBound,
  timeSlots,
  timeToDigits,
  type DateBound,
  type FieldIssue,
} from "../utils/dateField";

/**
 * The app's one date/time input (NEO-132) — every date, time and date+time
 * field uses it instead of the browser's native pickers, which let a 5-digit
 * year through and look different on every platform.
 *
 * - `mode="date"` (default): typed DD/MM/YYYY in the locale's order (at most
 *   8 digits, so the year can't grow a 5th digit) + a calendar card. Value:
 *   "YYYY-MM-DD" or null.
 * - `mode="time"`: typed HH:MM + a list of slots. Value: "HH:mm" or null.
 * - `mode="datetime"`: the two side by side (Łukasz's T2, 2026-09-27).
 *   Value: "YYYY-MM-DDTHH:mm" or null until both halves are valid.
 *
 * Invalid or half-typed text emits null and the field shows why; the
 * caller's `rules` (e.g. "required", "end after start") see the value, never
 * the raw text.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    mode?: "date" | "time" | "datetime";
    label?: string;
    /** datetime mode: label of the time half (default "Time"). */
    timeLabel?: string;
    hint?: string;
    persistentHint?: boolean;
    rules?: ((v: unknown) => true | string)[];
    errorMessages?: string | string[];
    variant?: "outlined" | "filled" | "underlined" | "plain" | "solo" | "solo-inverted" | "solo-filled";
    density?: "default" | "comfortable" | "compact";
    color?: string;
    disabled?: boolean;
    /** Earliest/latest date ("YYYY-MM-DD" or "today"). In datetime mode min "today" also blocks past times today. */
    min?: DateBound;
    max?: DateBound;
    /** Calendar opens on a year grid when empty — for dates of birth. */
    openAt?: "day" | "year";
    /** Shortcut chips above the calendar: recent days or coming days. */
    quickPicks?: "past" | "future" | "none";
    /** Minutes between time slots. */
    step?: number;
    /** Wall-clock intervals ("HH:mm") already taken that day — overlapping slots are struck through. */
    busy?: { start: string; end: string }[];
    /** Length of the booking being made (minutes): a slot is busy when that booking would overlap a taken one. */
    busyDuration?: number;
    testId?: string;
  }>(),
  {
    modelValue: null,
    mode: "date",
    label: undefined,
    timeLabel: undefined,
    hint: undefined,
    persistentHint: false,
    rules: () => [],
    errorMessages: undefined,
    variant: "outlined",
    density: "comfortable",
    color: undefined,
    disabled: false,
    min: undefined,
    max: undefined,
    openAt: "day",
    quickPicks: "none",
    step: 15,
    busy: undefined,
    busyDuration: undefined,
    testId: undefined,
  },
);

const emit = defineEmits<{ "update:modelValue": [value: string | null] }>();

const { t, locale } = useI18n();
const { xs } = useDisplay();
const isPhone = computed(() => xs.value);

const fmt = computed(() => dateFormatFor(intlLocale(locale.value)));
/** "Luty" / "Febrero" — it opens the sentence ("Luty 2026 ma 28 dni"), so capitalized. */
function monthName(month: number, year: number): string {
  const name = new Intl.DateTimeFormat(intlLocale(locale.value), { month: "long" }).format(new Date(year, month - 1, 1));
  return name.charAt(0).toLocaleUpperCase(intlLocale(locale.value)) + name.slice(1);
}

const minDate = computed(() => resolveBound(props.min));
const maxDate = computed(() => resolveBound(props.max));

// ── State: the typed digits are the source of truth while editing ─────────

function splitModel(v: string | null | undefined): { date: string | null; time: string | null } {
  if (!v) return { date: null, time: null };
  if (props.mode === "time") return { date: null, time: v };
  if (props.mode === "date") return { date: v, time: null };
  const [date, time] = v.split("T");
  return { date: date || null, time: time ? time.slice(0, 5) : null };
}

const dateDigits = ref("");
const timeDigits = ref("");
const dateFocused = ref(false);
const timeFocused = ref(false);

const dateCheck = computed(() =>
  checkDateDigits(dateDigits.value, fmt.value, { min: minDate.value, max: maxDate.value, monthName }),
);
const dateIso = computed(() => dateCheck.value.iso);

/** A booking can't start in the past: with min "today", times before now are out today. */
const minTime = computed(() => {
  if (props.mode !== "datetime" || props.min !== "today" || dateIso.value !== localIsoDate()) return undefined;
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
});
const timeCheck = computed(() => checkTimeDigits(timeDigits.value, { min: minTime.value }));
const time = computed(() => timeCheck.value.time);

const value = computed<string | null>(() => {
  if (props.mode === "date") return dateIso.value;
  if (props.mode === "time") return time.value;
  return dateIso.value && time.value ? `${dateIso.value}T${time.value}` : null;
});

function syncFromModel(v: string | null | undefined) {
  if ((v ?? null) === value.value) return;
  const parts = splitModel(v);
  dateDigits.value = isoToDateDigits(parts.date, fmt.value);
  timeDigits.value = timeToDigits(parts.time);
}
watch(() => props.modelValue, syncFromModel, { immediate: true });
// Locale switch reorders the digits (d/m/y ↔ m/d/y) of the same date.
watch(fmt, (next, prev) => {
  if (dateIso.value || !prev) dateDigits.value = isoToDateDigits(dateIso.value, next);
});
watch(value, (v) => {
  if (v !== (props.modelValue ?? null)) emit("update:modelValue", v);
});

const dateText = computed(() => formatDateDigits(dateDigits.value, fmt.value));
const timeText = computed(() => formatTimeDigits(timeDigits.value));

/**
 * A refused keystroke (a 5th year digit, a letter) leaves the digits — and so
 * the rendered text — unchanged, and Vue then skips the DOM update, so the
 * browser would keep showing what was typed. Write the mask back by hand.
 */
function enforceMask(field: typeof dateInput, text: string) {
  void nextTick(() => {
    const input = field.value?.$el.querySelector("input");
    if (input && input.value !== text) input.value = text;
  });
}

function onDateInput(v: string | null) {
  // A pasted ISO date ("1979-03-15", e.g. from another system) is read as a
  // date, not as digits in the locale's order.
  const iso = /^\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(v ?? "")?.[1];
  dateDigits.value = iso ? isoToDateDigits(iso, fmt.value) : onlyDigits(v ?? "", DATE_DIGITS);
  enforceMask(dateInput, dateText.value);
}
function onTimeInput(v: string | null) {
  timeDigits.value = onlyDigits(v ?? "", TIME_DIGITS);
  enforceMask(timeInput, timeText.value);
}

// ── Validation ────────────────────────────────────────────────────────────

const dateInput = ref<{ validate: () => Promise<string[]>; $el: HTMLElement } | null>(null);
const timeInput = ref<{ validate: () => Promise<string[]>; $el: HTMLElement } | null>(null);

function issueText(issue: FieldIssue): string {
  return t(issue.key, issue.params ?? {});
}

/**
 * A half-typed value only counts as an error once the field is left, so
 * "Enter the full date" doesn't flash after the first digit. A wrong month
 * or day shows at once — there's nothing left to type that would fix it.
 */
function ownIssue(check: { issue: FieldIssue | null }, focused: boolean): true | string {
  const issue = check.issue;
  if (!issue) return true;
  if (focused && (issue.key === "app.dateField.incomplete" || issue.key === "app.dateField.timeIncomplete")) return true;
  return issueText(issue);
}

const callerRules = computed(() => props.rules.map((rule) => () => rule(value.value)));

const dateRules = computed(() => [() => ownIssue(dateCheck.value, dateFocused.value), ...callerRules.value]);
const timeRules = computed(() => [
  () => ownIssue(timeCheck.value, timeFocused.value),
  // Date+time: the caller's rules sit on the date half; the time half only needs itself.
  ...(props.mode === "time" ? callerRules.value : []),
]);

function onDateFocus(focused: boolean) {
  dateFocused.value = focused;
  if (!focused) void nextTick(() => dateInput.value?.validate());
}
function onTimeFocus(focused: boolean) {
  timeFocused.value = focused;
  if (!focused) void nextTick(() => timeInput.value?.validate());
}

// ── Calendar ──────────────────────────────────────────────────────────────

const dateOpen = ref(false);
const viewMode = ref<"month" | "months" | "year">("month");
const dateTarget = computed(() => dateInput.value?.$el ?? undefined);

watch(dateOpen, (open) => {
  if (open) viewMode.value = props.openAt === "year" && !dateIso.value ? "year" : "month";
});

const pickerDate = computed(() => (dateIso.value ? new Date(`${dateIso.value}T00:00:00`) : null));

function pickIso(iso: string) {
  dateDigits.value = isoToDateDigits(iso, fmt.value);
  dateOpen.value = false;
  void nextTick(() => dateInput.value?.validate());
}

function onPick(v: unknown) {
  const d = Array.isArray(v) ? v[0] : v;
  if (d instanceof Date) pickIso(localIsoDate(d));
}

function clearDate() {
  dateDigits.value = "";
  dateOpen.value = false;
}

const quickPicks = computed(() => {
  if (props.quickPicks === "none") return [];
  const today = localIsoDate();
  const list =
    props.quickPicks === "past"
      ? [
          { key: "app.dateField.today", iso: today },
          { key: "app.dateField.yesterday", iso: addDaysIso(today, -1) },
          { key: "app.dateField.weekAgo", iso: addDaysIso(today, -7) },
        ]
      : [
          { key: "app.dateField.today", iso: today },
          { key: "app.dateField.tomorrow", iso: addDaysIso(today, 1) },
          { key: "app.dateField.inWeek", iso: addDaysIso(today, 7) },
        ];
  return list.map((q) => ({
    ...q,
    allowed: (!minDate.value || q.iso >= minDate.value) && (!maxDate.value || q.iso <= maxDate.value),
  }));
});

// ── Times ─────────────────────────────────────────────────────────────────

const timeOpen = ref(false);
const timeTarget = computed(() => timeInput.value?.$el ?? undefined);
const slotList = ref<HTMLElement | null>(null);

const slots = computed(() => {
  const all = timeSlots(props.step);
  const taken = busySlots(all, props.busy ?? [], props.busyDuration ?? props.step);
  return all.map((s) => ({
    time: s,
    busy: taken.has(s),
    disabled: taken.has(s) || (!!minTime.value && s < minTime.value),
  }));
});

watch(timeOpen, async (open) => {
  if (!open) return;
  await nextTick();
  // Start the list at the chosen time (or the first free slot) instead of 07:00.
  const target = time.value ?? slots.value.find((s) => !s.disabled)?.time;
  const list = slotList.value;
  const el = target ? list?.querySelector<HTMLElement>(`[data-time="${target}"]`) : null;
  // Scroll the list only — scrollIntoView would also move the page under the menu.
  if (list && el) list.scrollTop = el.offsetTop - list.clientHeight / 2 + el.offsetHeight / 2;
});

function pickTime(hhmm: string) {
  timeDigits.value = timeToDigits(hhmm);
  timeOpen.value = false;
  void nextTick(() => timeInput.value?.validate());
}

// ── Labels ────────────────────────────────────────────────────────────────

const datePlaceholder = computed(() =>
  fmt.value.order
    .map((p) => t(p === "d" ? "app.dateField.placeholderDay" : p === "m" ? "app.dateField.placeholderMonth" : "app.dateField.placeholderYear"))
    .join(fmt.value.sep),
);
</script>

<style scoped>
/* Date | Time stay on one line even on a phone (T2): the date takes 3/5, the time 2/5. */
.app-date-field--pair {
  flex-wrap: nowrap;
  gap: 12px;
}
.app-date-field--pair .app-date-field__date {
  flex: 3 1 0;
}
.app-date-field--pair .app-date-field__time {
  flex: 2 1 0;
}
.app-date-field__open {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-inline-end: -4px;
  border-radius: 8px;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
}
.app-date-field__open:disabled {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  cursor: default;
}
.app-date-field__open:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
}
.app-date-field__panel {
  background: rgb(var(--v-theme-surface));
  border-radius: 16px;
  padding: 12px;
  width: 320px;
  max-width: 100vw;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
}
.v-bottom-sheet .app-date-field__panel {
  width: 100%;
  border-radius: 20px 20px 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
}
.app-date-field__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}
.app-date-field__chip {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface));
}
.app-date-field__chip:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.12);
}
.app-date-field__chip:disabled {
  opacity: 0.4;
}
.app-date-field__picker {
  background: transparent;
  box-shadow: none;
}
.app-date-field__footer {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-top: 8px;
  margin-top: 4px;
}
.app-date-field__action {
  font-size: 14px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 8px;
  color: rgb(var(--v-theme-primary));
}
.app-date-field__action--muted {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.app-date-field__panel--times {
  width: 100%;
  padding: 8px;
}
.app-date-field__slots {
  display: grid;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}
.app-date-field__slot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: start;
  color: rgb(var(--v-theme-on-surface));
}
.app-date-field__slot:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.app-date-field__slot.is-selected {
  background: rgba(var(--v-theme-primary), 0.16);
  font-weight: 600;
}
.app-date-field__slot:disabled {
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  cursor: default;
}
.app-date-field__slot.is-busy span {
  text-decoration: line-through;
}
.app-date-field__slot small {
  font-size: 12px;
}
.v-bottom-sheet .app-date-field__panel--times {
  width: 100%;
}
.v-bottom-sheet .app-date-field__slots {
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  max-height: 50vh;
}
.v-bottom-sheet .app-date-field__slot {
  justify-content: center;
  flex-direction: column;
  background: rgba(var(--v-theme-on-surface), 0.05);
}
</style>
