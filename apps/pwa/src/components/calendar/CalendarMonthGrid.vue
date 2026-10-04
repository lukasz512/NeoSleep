<template>
  <!-- Month grid (CORE-122). Desktop/tablet: up to 3 entries per day plus "n more".
       Phone (compact): a date and coloured dots; the selected day's list sits below, in CalendarView. -->
  <div class="cal-mo" :class="{ 'cal-mo--compact': compact }">
    <div v-for="(label, i) in weekdayLabels" :key="'w' + i" class="cal-mo__wd">{{ label }}</div>
    <div
      v-for="day in cells"
      :key="dateKey(day)"
      class="cal-mo__cell"
      :class="{
        'cal-mo__cell--out': day.getMonth() !== month,
        'cal-mo__cell--today': isSameDay(day, today),
        'cal-mo__cell--weekend': day.getDay() % 6 === 0,
        'cal-mo__cell--selected': isSameDay(day, selected),
      }"
      @click="emit('select', day)"
    >
      <button
        type="button"
        class="cal-mo__num"
        :aria-label="fullDate(day)"
        data-testid="calendar-day-link"
        @click.stop="compact ? emit('select', day) : emit('day', day, $event.currentTarget as HTMLElement)"
      >
        {{ day.getDate() }}
      </button>
      <template v-if="!compact">
        <button
          v-for="e in shown(day)"
          :key="e.id"
          type="button"
          class="cal-mo__row"
          :class="{ 'cal-mo__row--past': e.past, 'cal-mo__row--cancelled': e.status === 'cancelled' }"
          :style="{ '--cal-color': e.color }"
          data-testid="calendar-event"
          @click.stop="emit('open', e.id)"
        >
          <i class="cal-mo__dot" />
          <span class="cal-mo__time">{{ e.startLabel }}</span>
          <span class="cal-mo__title">{{ e.title }}</span>
        </button>
        <button v-if="hidden(day) > 0" type="button" class="cal-mo__more" @click.stop="emit('day', day, $event.currentTarget as HTMLElement)">
          {{ t("user.calendar.more", { count: hidden(day) }) }}
        </button>
      </template>
      <span v-else class="cal-mo__dots" aria-hidden="true">
        <i v-for="c in dotColors(day)" :key="c" class="cal-mo__dot" :style="{ '--cal-color': c }" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { dateKey, isSameDay } from "../../utils/calendarLayout";
import type { CalendarGridEvent } from "./calendarTypes";

const MAX_ROWS = 3;

const props = defineProps<{
  cells: Date[];
  /** The month on show (0–11); other days are greyed. */
  month: number;
  events: CalendarGridEvent[];
  today: Date;
  selected: Date;
  locale: string;
  compact?: boolean;
}>();

const emit = defineEmits<{
  open: [id: string];
  day: [day: Date, el: HTMLElement];
  select: [day: Date];
}>();

const { t } = useI18n();

const byDay = computed(() => {
  const map = new Map<string, CalendarGridEvent[]>();
  for (const e of props.events) {
    const list = map.get(e.dayKey) ?? [];
    list.push(e);
    map.set(e.dayKey, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.startMin - b.startMin);
  return map;
});

const list = (day: Date) => byDay.value.get(dateKey(day)) ?? [];
const shown = (day: Date) => list(day).slice(0, list(day).length > MAX_ROWS ? MAX_ROWS - 1 : MAX_ROWS);
const hidden = (day: Date) => list(day).length - shown(day).length;
const dotColors = (day: Date) => [...new Set(list(day).map((e) => e.color))].slice(0, 3);

const weekdayLabels = computed(() => {
  const fmt = new Intl.DateTimeFormat(props.locale, { weekday: props.compact ? "narrow" : "short" });
  return props.cells.slice(0, 7).map((d) => fmt.format(d).replace(".", ""));
});

function fullDate(day: Date): string {
  return new Intl.DateTimeFormat(props.locale, { dateStyle: "full" }).format(day);
}
</script>

<style scoped>
.cal-mo {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: auto repeat(6, minmax(104px, 1fr));
  min-height: 100%;
}

.cal-mo__wd {
  position: sticky;
  top: 0;
  z-index: 4;
  padding: calc(var(--cal-top, 72px) + 2px) 10px 6px;
  text-align: right;
  font-size: 0.75rem;
  color: var(--cal-muted);
  text-transform: capitalize;
  background: var(--cal-frost);
  -webkit-backdrop-filter: blur(14px) saturate(170%);
  backdrop-filter: blur(14px) saturate(170%);
  border-bottom: 0.5px solid var(--cal-line-strong);
}

.cal-mo__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 4px 5px;
  border-right: 0.5px solid var(--cal-line);
  border-bottom: 0.5px solid var(--cal-line);
  transition: background-color 0.2s;
}

.cal-mo__cell:nth-child(7n + 7) {
  border-right: 0;
}

.cal-mo__cell:hover {
  background-color: var(--cal-hover-soft);
}

.cal-mo__cell--weekend {
  background-color: var(--cal-weekend);
}

.cal-mo__cell--selected {
  box-shadow: inset 0 0 0 1.5px rgba(var(--v-theme-primary), 0.55);
}

.cal-mo__num {
  align-self: flex-end;
  min-width: 26px;
  height: 26px;
  padding: 0 5px;
  border: 0;
  border-radius: 13px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal-mo__num:hover {
  background: var(--cal-hover);
}

.cal-mo__num:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.cal-mo__cell--out .cal-mo__num {
  color: var(--cal-faint);
}

.cal-mo__cell--today .cal-mo__num {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 700;
}

.cal-mo__row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 1px 4px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  font-size: 0.71875rem;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
}

.cal-mo__row:hover {
  background: color-mix(in srgb, var(--cal-color) 14%, transparent);
}

.cal-mo__row--past {
  opacity: 0.62;
}

.cal-mo__row--cancelled .cal-mo__title {
  text-decoration: line-through;
}

.cal-mo__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cal-color);
}

.cal-mo__time {
  flex: none;
  color: var(--cal-muted);
  font-variant-numeric: tabular-nums;
}

.cal-mo__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cal-mo__more {
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--cal-muted);
  font: inherit;
  font-size: 0.6875rem;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

/* Phone: date + dots, the selected day as a filled circle. */
.cal-mo--compact {
  grid-template-rows: auto repeat(6, 52px);
  min-height: 0;
}

.cal-mo--compact .cal-mo__wd {
  padding: calc(var(--cal-top, 72px) + 2px) 0 6px;
  text-align: center;
  font-size: 0.6875rem;
}

.cal-mo--compact .cal-mo__cell {
  align-items: center;
  padding: 4px 0;
  border-right: 0;
  cursor: pointer;
}

.cal-mo--compact .cal-mo__cell--selected {
  box-shadow: none;
}

.cal-mo--compact .cal-mo__num {
  align-self: center;
  width: 34px;
  height: 34px;
  border-radius: 17px;
  font-size: 0.9375rem;
}

.cal-mo--compact .cal-mo__cell--selected .cal-mo__num {
  background: rgb(var(--v-theme-on-surface));
  color: rgb(var(--v-theme-surface));
  font-weight: 600;
}

.cal-mo--compact .cal-mo__cell--selected.cal-mo__cell--today .cal-mo__num {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.cal-mo__dots {
  display: flex;
  gap: 3px;
  height: 5px;
}

.cal-mo__dots .cal-mo__dot {
  width: 5px;
  height: 5px;
}
</style>
