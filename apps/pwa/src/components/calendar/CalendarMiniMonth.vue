<template>
  <!-- Sidebar mini month (CORE-122): the visible week or day is highlighted; a click jumps there. -->
  <section class="cal-mini">
    <header class="cal-mini__head">
      <span class="cal-mini__title">{{ title }}</span>
      <span class="cal-mini__nav">
        <button type="button" class="cal-mini__arrow" :aria-label="t('user.calendar.prevMonth')" @click="emit('shift', -1)">
          <AppIcon name="chevron-left" />
        </button>
        <button type="button" class="cal-mini__arrow" :aria-label="t('user.calendar.nextMonth')" @click="emit('shift', 1)">
          <AppIcon name="chevron-right" />
        </button>
      </span>
    </header>
    <div class="cal-mini__grid">
      <span v-for="(label, i) in weekdayLabels" :key="'w' + i" class="cal-mini__wd">{{ label }}</span>
      <button
        v-for="day in cells"
        :key="dateKey(day)"
        type="button"
        class="cal-mini__day"
        :class="dayClass(day)"
        :aria-label="fullDate(day)"
        @click="emit('pick', day)"
      >
        {{ day.getDate() }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import { addDays, capitalizeFirst, dateKey, isSameDay, monthCells } from "../../utils/calendarLayout";

const props = defineProps<{
  month: Date;
  today: Date;
  /** Highlighted range, half-open: one day in the day view, seven in the week view, none in the month view. */
  rangeStart: Date | null;
  rangeDays: number;
  locale: string;
}>();

const emit = defineEmits<{
  pick: [day: Date];
  shift: [direction: -1 | 1];
}>();

const { t } = useI18n();

const cells = computed(() => monthCells(props.month));
const title = computed(() => capitalizeFirst(new Intl.DateTimeFormat(props.locale, { month: "long", year: "numeric" }).format(props.month)));
const weekdayLabels = computed(() => {
  const fmt = new Intl.DateTimeFormat(props.locale, { weekday: "narrow" });
  return cells.value.slice(0, 7).map((d) => fmt.format(d));
});

function fullDate(day: Date): string {
  return new Intl.DateTimeFormat(props.locale, { dateStyle: "full" }).format(day);
}

function dayClass(day: Date): Record<string, boolean> {
  const start = props.rangeStart;
  const inRange = !!start && day >= start && day < addDays(start, props.rangeDays);
  return {
    "cal-mini__day--out": day.getMonth() !== props.month.getMonth(),
    "cal-mini__day--today": isSameDay(day, props.today),
    "cal-mini__day--range": inRange && props.rangeDays > 1,
    "cal-mini__day--range-start": inRange && props.rangeDays > 1 && isSameDay(day, start),
    "cal-mini__day--range-end": inRange && props.rangeDays > 1 && isSameDay(day, addDays(start, props.rangeDays - 1)),
    "cal-mini__day--selected": inRange && props.rangeDays === 1,
  };
}
</script>

<style scoped>
.cal-mini__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.cal-mini__title {
  font-weight: 600;
}

.cal-mini__nav {
  display: flex;
}

.cal-mini__arrow {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  cursor: pointer;
}

.cal-mini__arrow:hover {
  background: var(--cal-hover);
}

.cal-mini__arrow :deep(svg) {
  width: 16px;
  height: 16px;
}

.cal-mini__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  row-gap: 2px;
  text-align: center;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.cal-mini__wd {
  padding-bottom: 4px;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--cal-faint);
  text-transform: uppercase;
}

.cal-mini__day {
  height: 28px;
  border: 0;
  border-radius: 14px;
  background: none;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal-mini__day:hover {
  background: var(--cal-hover);
}

.cal-mini__day:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.cal-mini__day--out {
  color: var(--cal-faint);
}

.cal-mini__day--today {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.cal-mini__day--range {
  border-radius: 0;
  background: rgba(var(--v-theme-primary), 0.12);
}

.cal-mini__day--range-start {
  border-radius: 14px 0 0 14px;
}

.cal-mini__day--range-end {
  border-radius: 0 14px 14px 0;
}

.cal-mini__day--selected {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 600;
}
</style>
