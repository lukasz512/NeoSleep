<template>
  <div class="next-visit" :class="{ 'next-visit--attention': attention, 'next-visit--compact': compact }" data-testid="next-visit-cell">
    <span class="next-visit__main">{{ main }}</span>
    <span v-if="sub && !compact" class="next-visit__sub">{{ sub }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatDateShort, formatRelativeToNow } from "../../utils/relativeDate";
import { isAttentionLine, type NextVisitLine } from "../../utils/clinicalProgress";

/**
 * The Tratamientos "Próxima cita" cell: the booked visit, or what is missing
 * (order not sent, visit overdue / not booked) drawn in the attention colour.
 * `compact` = the phone card's one-line status.
 */
const props = defineProps<{ line: NextVisitLine; locale: string; compact?: boolean }>();
const { t } = useI18n();

const attention = computed(() => isAttentionLine(props.line));

function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(props.locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const main = computed(() => {
  const line = props.line;
  switch (line.kind) {
    case "sendOrder": return t("app.clinicalQueues.next.sendOrder");
    case "checkOrder": return t("app.clinicalQueues.next.checkOrder");
    case "booked": return props.compact ? formatDateShort(line.at, props.locale) : dateTime(line.at);
    case "overdue": return t("app.clinicalQueues.next.overdue", { date: formatDateShort(line.at, props.locale) });
    case "unbooked": return t("app.clinicalQueues.next.unbooked");
    case "expected": return t("app.clinicalQueues.next.expected", { date: formatDateShort(line.at, props.locale) });
    default: return "—";
  }
});

const sub = computed(() => {
  const line = props.line;
  if (line.kind === "overdue") return formatRelativeToNow(line.at, props.locale);
  if (line.kind === "unbooked" && line.at) return t("app.clinicalQueues.next.bookBy", { date: formatDateShort(line.at, props.locale) });
  if (line.kind === "booked") return formatRelativeToNow(line.at, props.locale);
  return "";
});
</script>

<style scoped>
.next-visit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}
.next-visit__main {
  font-weight: 500;
}
.next-visit--attention .next-visit__main {
  color: rgb(var(--v-theme-warning));
}
.next-visit__sub {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.next-visit--compact .next-visit__main {
  font-size: 0.8125rem;
}
</style>
