<template>
  <div class="next-visit" data-testid="tile-appointment">
    <button type="button" class="next-visit__main" data-testid="next-visit-open" @click="emit('open')">
      <span class="next-visit__leaf" aria-hidden="true">
        <span class="next-visit__month">{{ month }}</span>
        <span class="next-visit__day">{{ day }}</span>
      </span>
      <span class="next-visit__text">
        <span class="next-visit__key">{{ keyLine }}</span>
        <span class="next-visit__title" :title="title">{{ title }}</span>
        <span class="next-visit__meta">
          <span class="next-visit__when">{{ when }}</span>
          <VChip v-if="chip" size="x-small" variant="tonal" :color="chip.color" class="next-visit__chip" data-testid="next-visit-chip">{{ chip.text }}</VChip>
        </span>
      </span>
      <AppIcon name="chevron-right" class="next-visit__chevron" />
    </button>
    <div v-if="canReschedule || canComplete" class="next-visit__actions">
      <AppButton v-if="canReschedule" size="small" variant="tonal" class="next-visit__action text-none" data-testid="next-visit-reschedule" @click="emit('reschedule')">
        <AppIcon name="calendar-clock" class="next-visit__action-icon" />
        {{ t("user.appointments.detail.reschedule") }}
      </AppButton>
      <AppButton
        v-if="canComplete"
        size="small"
        variant="flat"
        color="primary"
        class="next-visit__action text-none"
        :loading="busy"
        data-testid="next-visit-complete"
        @click="emit('complete')"
      >
        <AppIcon name="check-circle" class="next-visit__action-icon" />
        {{ t("app.patients.detail.nextVisit.done") }}
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VChip } from "vuetify/components";
import { intlLocale } from "@i18n/language-options";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";

/**
 * The next visit on the patient's Detalles strip (CORE-162, variant C): a
 * calendar leaf, what the visit is, a relative day and the patient's answer,
 * plus Reschedule / Done on the tile itself. The leaf area opens the visit.
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
const when = computed(() => `${fmt({ weekday: "short" }).replace(".", "")} ${fmt({ hour: "2-digit", minute: "2-digit" })}`);

/** Calendar days from today to the visit, counted in the visit's zone. */
function dayNumber(date: Date): number {
  const [y, m, d] = date.toLocaleDateString("en-CA", { timeZone: props.timeZone }).split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}
/** "tomorrow", "in 3 days" — only within the week; beyond that the leaf says enough. */
const relative = computed(() => {
  const days = dayNumber(start.value) - dayNumber(new Date(props.now ?? Date.now()));
  if (days < 0 || days > 6) return null;
  return new Intl.RelativeTimeFormat(lang.value, { numeric: "auto" }).format(days, "day");
});
const keyLine = computed(() => (relative.value ? `${props.label} · ${relative.value}` : props.label));
</script>

<style scoped>
.next-visit {
  grid-column: span 2;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.next-visit__main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3, 12px);
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
.next-visit__main:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));
}

.next-visit__leaf {
  display: flex;
  flex-direction: column;
  width: 48px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgb(var(--v-theme-surface));
  text-align: center;
}
.next-visit__month {
  padding: 2px 0;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.next-visit__day {
  padding: 4px 0;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.next-visit__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.next-visit__key {
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
.next-visit__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}
.next-visit__when {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit__chevron {
  width: 18px;
  height: 18px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.next-visit__actions {
  display: flex;
  gap: var(--space-2, 8px);
  margin: 0 var(--space-3, 12px);
  padding: var(--space-2, 8px) 0 var(--space-3, 12px);
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}
.next-visit__action {
  flex: 1;
}
.next-visit__action-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}
</style>
