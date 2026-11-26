<template>
  <!-- CORE-161: one day's entries. "inline" sits under the phone month; "popover" floats by the clicked
       day (tablet/desktop); "pinned" is the same list docked on the right, following the selected day. -->
  <section class="cal-dl" :class="`cal-dl--${mode}`" :aria-label="label" data-testid="calendar-list">
    <header class="cal-dl__head">
      <h2 class="cal-dl__title">{{ label }}</h2>
      <template v-if="mode !== 'inline'">
        <button type="button" class="cal-dl__btn" :aria-label="t('user.calendar.dayList.add')" :title="t('user.calendar.dayList.add')" data-testid="calendar-list-add" @click="emit('add')">
          <AppIcon name="plus" />
        </button>
        <button
          v-if="canPin"
          type="button"
          class="cal-dl__btn"
          :class="{ 'cal-dl__btn--on': mode === 'pinned' }"
          :aria-label="t(mode === 'pinned' ? 'user.calendar.dayList.unpin' : 'user.calendar.dayList.pin')"
          :title="t(mode === 'pinned' ? 'user.calendar.dayList.unpin' : 'user.calendar.dayList.pin')"
          :aria-pressed="mode === 'pinned'"
          data-testid="calendar-list-pin"
          @click="emit('pin', mode !== 'pinned')"
        >
          <AppIcon name="pin" />
        </button>
        <button v-if="mode === 'popover'" type="button" class="cal-dl__btn" :aria-label="t('app.common.close')" data-testid="calendar-list-close" @click="emit('close')">
          <AppIcon name="close" />
        </button>
      </template>
    </header>

    <p v-if="!events.length" class="cal-dl__empty">{{ t("user.calendar.dayEmpty") }}</p>
    <button
      v-for="e in events"
      :key="e.id"
      type="button"
      class="cal-dl__row"
      :class="{ 'cal-dl__row--cancelled': e.status === 'cancelled', 'cal-dl__row--past': e.past }"
      :style="{ '--cal-color': e.color }"
      data-testid="calendar-row"
      :data-id="e.id"
      @click="emit('open', e.id)"
    >
      <span class="cal-dl__time">
        <span>{{ e.startLabel }}</span>
        <span class="cal-dl__end">{{ clock(e.endMin) }}</span>
      </span>
      <span class="cal-dl__main">
        <span class="cal-dl__name-line">
          <AppIcon :name="e.icon" class="cal-dl__icon" />
          <span class="cal-dl__name">{{ e.title }}</span>
          <AppIcon v-if="e.responseIcon" :name="e.responseIcon" class="cal-dl__icon" :style="{ color: e.responseColor }" />
        </span>
        <span v-if="e.meta" class="cal-dl__meta">{{ e.meta }}</span>
      </span>
    </button>

    <button v-if="mode !== 'inline'" type="button" class="cal-dl__open" data-testid="calendar-list-open-day" @click="emit('openDay')">
      {{ t("user.calendar.dayList.openDay") }}
      <AppIcon name="arrow-right" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import type { CalendarGridEvent } from "./calendarTypes";

withDefaults(
  defineProps<{
    label: string;
    events: CalendarGridEvent[];
    mode: "inline" | "popover" | "pinned";
    /** The pin needs room for a side column, so it only shows on wide screens. */
    canPin?: boolean;
  }>(),
  { canPin: false },
);

const emit = defineEmits<{
  open: [id: string];
  add: [];
  openDay: [];
  close: [];
  pin: [on: boolean];
}>();

const { t } = useI18n();

function clock(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
</script>

<style scoped>
.cal-dl {
  display: grid;
  align-content: start;
  gap: 8px;
}

.cal-dl__head {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 32px;
}

.cal-dl__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0 4px;
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal-dl--inline .cal-dl__title {
  margin-bottom: 2px;
  font-size: 0.8125rem;
  color: var(--cal-muted);
}

.cal-dl__btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--cal-muted);
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.cal-dl__btn:first-of-type {
  color: rgb(var(--v-theme-primary));
}

.cal-dl__btn:hover {
  background: var(--cal-hover);
}

.cal-dl__btn--on {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.cal-dl__btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.cal-dl__empty {
  margin: 0;
  padding: 16px 0;
  text-align: center;
  color: var(--cal-muted);
}

.cal-dl__row {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 0 0 0.5px var(--cal-line-strong);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s;
}

/* On glass the rows stay solid enough to read, but let the frost through a little. */
.cal-dl--popover .cal-dl__row,
.cal-dl--pinned .cal-dl__row {
  padding: 8px 10px;
  border-radius: 12px;
  font-size: 0.875rem;
  background: color-mix(in srgb, rgb(var(--v-theme-surface)) 78%, transparent);
}

.cal-dl__row:hover {
  background: color-mix(in srgb, var(--cal-color) 10%, rgb(var(--v-theme-surface)));
}

.cal-dl__row:focus-visible,
.cal-dl__btn:focus-visible,
.cal-dl__open:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}

.cal-dl__row--past {
  opacity: 0.7;
}

.cal-dl__row--cancelled .cal-dl__name {
  text-decoration: line-through;
}

.cal-dl__time {
  display: grid;
  font-size: 0.8125rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.cal-dl__end {
  font-weight: 400;
  color: var(--cal-muted);
}

.cal-dl__main {
  display: grid;
  min-width: 0;
  padding-left: 10px;
  border-left: 3px solid var(--cal-color);
}

.cal-dl__name-line {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  font-weight: 600;
}

.cal-dl__icon {
  flex: none;
  width: 14px;
  height: 14px;
}

.cal-dl__name,
.cal-dl__meta {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.cal-dl__meta {
  font-size: 0.8125rem;
  color: var(--cal-muted);
}

.cal-dl__open {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 6px;
  margin-top: 2px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
}

.cal-dl__open:hover {
  background: rgba(var(--v-theme-primary), 0.1);
}

.cal-dl__open :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
