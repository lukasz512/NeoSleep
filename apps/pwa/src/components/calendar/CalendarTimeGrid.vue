<template>
  <!-- Day/week time grid, macOS Calendar style (CORE-122). Lives inside CalendarView's scroller:
       the day headers stick under the floating glass toolbar, the hour gutter sticks left. -->
  <div class="cal-tg" :class="{ 'cal-tg--multi': days.length > 1, 'cal-tg--compact': compact }" :style="{ '--cal-cols': days.length }">
    <div class="cal-tg__head cal-tg__corner" />
    <div v-for="day in days" :key="'h' + dateKey(day)" class="cal-tg__head" :class="{ 'cal-tg__head--today': isSameDay(day, today) }">
      <button type="button" class="cal-tg__head-btn" :aria-label="fullDate(day)" data-testid="calendar-day-link" @click="emit('day', day, $event.currentTarget as HTMLElement)">
        <span class="cal-tg__weekday">{{ weekday(day) }}</span>
        <span class="cal-tg__daynum">{{ day.getDate() }}</span>
      </button>
    </div>

    <div class="cal-tg__gutter" aria-hidden="true">
      <span v-for="h in 23" :key="h" class="cal-tg__hour" :style="{ top: `calc(var(--cal-hh) * ${h})` }">{{ hourLabel(h) }}</span>
      <span v-if="showsToday" class="cal-tg__now-label" :style="{ top: `calc(var(--cal-hh) * ${nowMinutes / 60})` }">{{ nowLabel }}</span>
    </div>

    <div
      v-for="day in days"
      :key="'c' + dateKey(day)"
      class="cal-tg__col"
      :class="{ 'cal-tg__col--weekend': day.getDay() % 6 === 0, 'cal-tg__col--today': isSameDay(day, today) }"
      @click="onColumnClick(day, $event)"
    >
      <button
        v-for="p in placed(day)"
        :key="p.item.id"
        type="button"
        class="cal-ev"
        :class="{ 'cal-ev--past': p.item.past, 'cal-ev--cancelled': p.item.status === 'cancelled', 'cal-ev--short': p.item.endMin - p.item.startMin < 45 }"
        :style="eventStyle(p)"
        data-testid="calendar-event"
        @click.stop="emit('open', p.item.id)"
      >
        <span class="cal-ev__title">
          <AppIcon :name="p.item.icon" class="cal-ev__icon" />
          <span class="cal-ev__name">{{ p.item.title }}</span>
          <AppIcon v-if="p.item.responseIcon" :name="p.item.responseIcon" class="cal-ev__response" :style="{ color: p.item.responseColor }" />
        </span>
        <span class="cal-ev__meta">{{ p.item.timeLabel }}<template v-if="p.item.meta"> · {{ p.item.meta }}</template></span>
      </button>
      <div v-if="isSameDay(day, today)" class="cal-tg__now" :style="{ top: `calc(var(--cal-hh) * ${nowMinutes / 60})` }" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "../AppIcon.vue";
import { dateKey, isSameDay, layoutDay, minutesAtOffset, type PlacedItem } from "../../utils/calendarLayout";
import type { CalendarGridEvent } from "./calendarTypes";

const props = defineProps<{
  days: Date[];
  events: CalendarGridEvent[];
  today: Date;
  nowMinutes: number;
  locale: string;
  /** Phone: one-letter weekdays stacked over the date. */
  compact?: boolean;
}>();

const emit = defineEmits<{
  open: [id: string];
  slot: [dayKey: string, minutes: number];
  day: [day: Date, el: HTMLElement];
}>();

const byDay = computed(() => {
  const map = new Map<string, PlacedItem<CalendarGridEvent>[]>();
  const groups = new Map<string, CalendarGridEvent[]>();
  for (const e of props.events) {
    const list = groups.get(e.dayKey) ?? [];
    list.push(e);
    groups.set(e.dayKey, list);
  }
  for (const [key, list] of groups) map.set(key, layoutDay(list));
  return map;
});

function placed(day: Date): PlacedItem<CalendarGridEvent>[] {
  return byDay.value.get(dateKey(day)) ?? [];
}

const showsToday = computed(() => props.days.some((d) => isSameDay(d, props.today)));

const pad = (n: number) => String(n).padStart(2, "0");
const hourLabel = (h: number) => `${pad(h)}:00`;
const nowLabel = computed(() => `${pad(Math.floor(props.nowMinutes / 60))}:${pad(props.nowMinutes % 60)}`);

function weekday(day: Date): string {
  const label = new Intl.DateTimeFormat(props.locale, { weekday: props.compact ? "narrow" : "short" }).format(day);
  return label.replace(".", "");
}
function fullDate(day: Date): string {
  return new Intl.DateTimeFormat(props.locale, { dateStyle: "full" }).format(day);
}

function eventStyle(p: PlacedItem<CalendarGridEvent>): Record<string, string> {
  const { item, lane, lanes } = p;
  const width = 100 / lanes;
  const hours = Math.max((item.endMin - item.startMin) / 60, 0.4);
  return {
    "--cal-color": item.color,
    top: `calc(var(--cal-hh) * ${item.startMin / 60} + 1px)`,
    height: `calc(var(--cal-hh) * ${hours} - 2px)`,
    left: `calc(${lane * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
  };
}

function onColumnClick(day: Date, event: MouseEvent) {
  const column = event.currentTarget as HTMLElement;
  const hourHeight = parseFloat(getComputedStyle(column).getPropertyValue("--cal-hh")) || 52;
  emit("slot", dateKey(day), minutesAtOffset(event.offsetY, hourHeight));
}
</script>

<style scoped>
.cal-tg {
  --cal-colmin: 0px;
  display: grid;
  grid-template-columns: var(--cal-gutter, 56px) repeat(var(--cal-cols), minmax(var(--cal-colmin), 1fr));
  min-width: min-content;
}

/* Phone week: columns keep a readable width and the grid scrolls sideways, snapping to days. */
.cal-tg--multi {
  --cal-colmin: var(--cal-day-min, 0px);
}

.cal-tg__head {
  position: sticky;
  top: 0;
  z-index: 6;
  display: flex;
  align-items: center;
  padding: calc(var(--cal-top, 72px) + 2px) 4px 6px;
  background: var(--cal-frost);
  -webkit-backdrop-filter: blur(14px) saturate(170%);
  backdrop-filter: blur(14px) saturate(170%);
  border-bottom: 0.5px solid var(--cal-line-strong);
}

.cal-tg__corner {
  left: 0;
  z-index: 8;
}

.cal-tg__head-btn {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--cal-muted);
  font: inherit;
  font-size: 0.8125rem;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal-tg__head-btn:hover {
  background: var(--cal-hover);
}

.cal-tg__head-btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.cal-tg__daynum {
  min-width: 30px;
  height: 30px;
  line-height: 30px;
  border-radius: 15px;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 300;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-on-surface));
}

.cal-tg__head--today .cal-tg__head-btn {
  color: rgb(var(--v-theme-primary));
}

.cal-tg__head--today .cal-tg__daynum {
  padding: 0 6px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 600;
}

.cal-tg__gutter {
  position: sticky;
  left: 0;
  z-index: 4;
  height: calc(var(--cal-hh) * 24);
  background: var(--pwa-sheet, rgb(var(--v-theme-surface)));
  border-right: 0.5px solid var(--cal-line);
}

.cal-tg__hour {
  position: absolute;
  right: 8px;
  transform: translateY(-50%);
  font-size: 0.6875rem;
  color: var(--cal-faint);
  font-variant-numeric: tabular-nums;
}

.cal-tg__now-label {
  position: absolute;
  right: 4px;
  z-index: 1;
  transform: translateY(-50%);
  padding: 0 2px;
  font-size: 0.6875rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-error));
  background: var(--pwa-sheet, rgb(var(--v-theme-surface)));
}

.cal-tg__col {
  position: relative;
  height: calc(var(--cal-hh) * 24);
  border-right: 0.5px solid var(--cal-line);
  background-image: repeating-linear-gradient(to bottom, var(--cal-line) 0 0.5px, transparent 0.5px var(--cal-hh));
  cursor: cell;
  scroll-snap-align: start;
}

.cal-tg__col--weekend {
  background-color: var(--cal-weekend);
}

.cal-tg__col--today {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.cal-tg__now {
  position: absolute;
  left: -1px;
  right: 0;
  z-index: 3;
  height: 2px;
  background: rgb(var(--v-theme-error));
  pointer-events: none;
}

.cal-tg__now::before {
  content: "";
  position: absolute;
  left: -5px;
  top: -4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--v-theme-error));
}

/* An entry: a tinted block with a coloured left edge, title then time. */
.cal-ev {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  padding: 3px 6px 3px 9px;
  border: 0;
  border-radius: 7px;
  font: inherit;
  font-size: 0.75rem;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
  background: color-mix(in srgb, var(--cal-color) var(--cal-ev-mix), var(--pwa-sheet, rgb(var(--v-theme-surface))));
  color: color-mix(in srgb, var(--cal-color) var(--cal-ev-ink), rgb(var(--v-theme-on-surface)));
  box-shadow:
    inset 3px 0 0 var(--cal-color),
    0 0 0 0.5px color-mix(in srgb, var(--cal-color) 30%, transparent);
  transition:
    transform 0.25s var(--menu-ease-out, ease),
    box-shadow 0.25s;
}

.cal-ev:hover {
  z-index: 9;
  transform: translateY(-1px);
  box-shadow:
    inset 3px 0 0 var(--cal-color),
    0 6px 16px -6px color-mix(in srgb, var(--cal-color) 60%, transparent);
}

.cal-ev:focus-visible {
  outline: 2px solid var(--cal-color);
  outline-offset: 1px;
}

.cal-ev--past {
  opacity: 0.62;
}

.cal-ev--cancelled .cal-ev__name {
  text-decoration: line-through;
}

.cal-ev--short {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding-block: 1px;
}

.cal-ev--short .cal-ev__meta {
  flex: 1 1 auto;
}

.cal-ev__title {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-weight: 600;
}

.cal-ev__icon,
.cal-ev__response {
  flex: none;
  width: 12px;
  height: 12px;
}

.cal-ev__name,
.cal-ev__meta {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal-ev__meta {
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

/* Phone: weekday letter stacked over the date, tighter blocks. */
.cal-tg--compact .cal-tg__head {
  justify-content: center;
}

.cal-tg--compact .cal-tg__head-btn {
  flex-direction: column;
  align-items: center;
  gap: 0;
  font-size: 0.6875rem;
}

.cal-tg--compact .cal-tg__daynum {
  min-width: 28px;
  height: 28px;
  line-height: 28px;
  font-size: 1.0625rem;
}

.cal-tg--compact .cal-tg__hour {
  right: 5px;
  font-size: 0.625rem;
}

.cal-tg--compact .cal-ev {
  padding: 2px 4px 2px 7px;
  border-radius: 6px;
  font-size: 0.6875rem;
}
</style>
