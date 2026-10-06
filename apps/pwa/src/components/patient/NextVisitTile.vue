<template>
  <div class="next-visit" data-testid="tile-appointment">
    <button type="button" class="next-visit__main" data-testid="next-visit-open" @click="emit('open')">
      <span class="next-visit__leaf" aria-hidden="true">
        <span class="next-visit__month">{{ month }}</span>
        <span class="next-visit__day">{{ day }}</span>
      </span>
      <span class="next-visit__text">
        <span class="next-visit__head">
          <span class="next-visit__key">{{ label }}</span>
          <VChip v-if="chip" size="x-small" variant="tonal" :color="chip.color" class="next-visit__chip" :title="chip.text" data-testid="next-visit-chip">{{ chip.text }}</VChip>
        </span>
        <span class="next-visit__title" :title="title">{{ title }}</span>
        <span class="next-visit__when">{{ when }}</span>
      </span>
    </button>
    <!-- Two tiles wide at most, one tile tall (Łukasz, 2026-10-06): the actions are icons beside the text. -->
    <div v-if="canReschedule || canComplete" class="next-visit__actions">
      <button
        v-if="canReschedule"
        type="button"
        class="next-visit__action"
        :aria-label="t('user.appointments.detail.reschedule')"
        :title="t('user.appointments.detail.reschedule')"
        data-testid="next-visit-reschedule"
        @click="emit('reschedule')"
      >
        <AppIcon name="calendar-clock" class="next-visit__action-icon" />
      </button>
      <button
        v-if="canComplete"
        type="button"
        class="next-visit__action next-visit__action--primary"
        :aria-label="t('app.patients.detail.nextVisit.done')"
        :title="t('app.patients.detail.nextVisit.done')"
        :disabled="busy"
        data-testid="next-visit-complete"
        @click="emit('complete')"
      >
        <AppIcon name="check-circle" class="next-visit__action-icon" />
      </button>
    </div>
    <AppIcon v-else name="chevron-right" class="next-visit__chevron" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VChip } from "vuetify/components";
import { intlLocale } from "@i18n/language-options";
import AppIcon from "../AppIcon.vue";

/**
 * The next visit on the patient's Detalles strip (CORE-162, variant C): a
 * calendar leaf, what the visit is, when (today / tomorrow / weekday) and the
 * patient's answer, plus Reschedule / Done as icons. At most two tiles wide
 * and one tile tall. The leaf area opens the visit.
 */
const props = defineProps<{
  label: string;
  startAt: string;
  /** The clinic's zone for an appointment; undefined (device zone) for an event. */
  timeZone?: string;
  title: string;
  chip?: { text: string; color?: string } | null;
  canReschedule: boolean;
  canComplete: boolean;
  busy?: boolean;
  /** "Now" for the relative day — injectable for tests. */
  now?: number;
}>();
const emit = defineEmits<{ open: []; reschedule: []; complete: [] }>();

const { t, locale } = useI18n();
const lang = computed(() => intlLocale(locale.value));
const start = computed(() => new Date(props.startAt));
const fmt = (opts: Intl.DateTimeFormatOptions) => start.value.toLocaleString(lang.value, { ...opts, timeZone: props.timeZone });

const month = computed(() => fmt({ month: "short" }).replace(".", "").toUpperCase());
const day = computed(() => fmt({ day: "numeric" }));

/** Calendar days from today to the visit, counted in the visit's zone. */
function dayNumber(date: Date): number {
  const [y, m, d] = date.toLocaleDateString("en-CA", { timeZone: props.timeZone }).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}
/** "today" / "tomorrow" — short words only; otherwise the weekday (the leaf has the date). */
const dayWord = computed(() => {
  const days = dayNumber(start.value) - dayNumber(new Date(props.now ?? Date.now()));
  if (days === 0 || days === 1) return new Intl.RelativeTimeFormat(lang.value, { numeric: "auto" }).format(days, "day");
  return fmt({ weekday: "short" }).replace(".", "");
});
const when = computed(() => `${dayWord.value} · ${fmt({ hour: "numeric", minute: "2-digit" })}`);
</script>

<style scoped>
.next-visit {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-width: 0;
  padding-right: var(--space-2, 8px);
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.next-visit__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  align-self: stretch;
  padding: var(--space-3, 12px);
  border: none;
  border-radius: var(--pwa-radius, 12px);
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.next-visit__main:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}
/* Inset, like the other tiles: never clipped by a parent. */
.next-visit__main:focus-visible,
.next-visit__action:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}

.next-visit__leaf {
  flex: none;
  display: flex;
  flex-direction: column;
  width: 40px;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
  text-align: center;
}
.next-visit__month {
  padding: 1px 0;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.next-visit__day {
  padding: 2px 0;
  font-size: 1.0625rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.next-visit__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
/* The chip sits beside the short label, where there is room; the time line stays whole. */
.next-visit__head {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.next-visit__key {
  flex: none;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit__title {
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.next-visit__when {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit__chip {
  min-width: 0;
  overflow: hidden;
}
/* A long answer ends in "…" rather than being cut mid-letter. */
.next-visit__chip :deep(.v-chip__content) {
  display: block;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Stacked, so the text keeps the width: the tile is only two columns wide. */
.next-visit__actions {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.next-visit__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: inherit;
  cursor: pointer;
  transition: background-color 150ms ease;
}
.next-visit__action:hover {
  background: rgba(var(--v-theme-on-surface), 0.14);
}
.next-visit__action--primary {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
.next-visit__action--primary:hover {
  background: rgba(var(--v-theme-primary), 0.85);
}
.next-visit__action:disabled {
  opacity: 0.6;
  cursor: progress;
}
.next-visit__action-icon {
  width: 16px;
  height: 16px;
}
.next-visit__chevron {
  flex: none;
  width: 18px;
  height: 18px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
