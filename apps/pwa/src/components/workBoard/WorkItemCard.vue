<template>
  <article
    class="work-card"
    :class="{ 'work-card--dragging': dragging, 'work-card--dense': dense }"
    :draggable="draggable"
    :data-testid="`work-card-${item.key}`"
    @dragstart="onDragStart"
    @dragend="dragging = false"
  >
    <button type="button" class="work-card__open" :aria-label="`${item.key} ${item.title}`" @click="emit('open', item.key)" @keydown="onKeydown">
      <span class="work-card__top">
        <span class="work-card__id">
          <span class="work-card__key">{{ item.key }}</span>
          <span
            v-if="fromSession || live"
            class="work-card__session"
            role="img"
            :title="sessionText"
            :aria-label="sessionText"
            data-testid="work-card-session"
          >
            <VIcon icon="mdi-robot-outline" size="14" aria-hidden="true" />
            <span v-if="live" class="work-card__live" data-testid="work-card-live" />
          </span>
        </span>
        <span v-if="item.priority" class="work-card__priority" :class="`work-card__priority--p${item.priority}`" :title="t(`workBoard.priority.p${item.priority}`)">
          {{ t(`workBoard.priority.short.p${item.priority}`) }}
        </span>
      </span>
      <span class="work-card__title">{{ item.title }}</span>
      <span
        v-if="progress"
        class="work-card__progress"
        :class="{ 'work-card__progress--complete': progress.done === progress.total }"
        :aria-label="t('workBoard.card.progress', progress)"
        data-testid="work-card-progress"
      >
        <VIcon icon="mdi-checkbox-marked-outline" size="14" aria-hidden="true" />{{ progress.done }}/{{ progress.total }}
      </span>
      <span v-if="!dense && (git || held)" class="work-card__marks">
        <span v-if="git" class="work-card__git" :class="{ 'work-card__git--alert': alert }" data-testid="work-card-git">
          <VIcon :icon="GIT_ICONS[git]" size="14" aria-hidden="true" />{{ t(`workBoard.git.${git}`) }}
        </span>
        <span v-if="held" class="work-card__git" data-testid="work-card-hold">
          <VIcon icon="mdi-pause-circle-outline" size="14" aria-hidden="true" />{{ t("workBoard.hold.on") }}
        </span>
      </span>
    </button>
    <span v-if="!dense && labels.length" class="work-card__labels" data-testid="work-card-labels">
      <WorkLabelChip
        v-for="label in labels.slice(0, MAX_CHIPS)"
        :key="label"
        :name="label"
        clickable
        small
        :aria-label="t('workBoard.labels.filterBy', { name: label })"
        :data-testid="`work-card-label-${label}`"
        @click="emit('label', label)"
      />
      <span v-if="labels.length > MAX_CHIPS" class="work-card__more" :title="labels.slice(MAX_CHIPS).join(', ')" data-testid="work-card-labels-more">
        +{{ labels.length - MAX_CHIPS }}
      </span>
    </span>
    <span v-if="showMeta || links.length" class="work-card__foot">
      <span v-if="showMeta" class="work-card__meta" :data-testid="dense ? 'work-card-compact' : 'work-card-footer'">
        <template v-if="dense">
          <span v-if="labels.length" class="work-card__dots" data-testid="work-card-dots">
            <WorkLabelChip v-for="label in labels" :key="label" :name="label" dot-only />
          </span>
          <span v-if="git" class="work-card__git" :class="{ 'work-card__git--alert': alert }" data-testid="work-card-git">
            <VIcon :icon="GIT_ICONS[git]" size="14" aria-hidden="true" />{{ t(`workBoard.git.${git}`) }}
          </span>
          <span v-if="held" class="work-card__git" data-testid="work-card-hold">
            <VIcon icon="mdi-pause-circle-outline" size="14" aria-hidden="true" />{{ t("workBoard.hold.on") }}
          </span>
        </template>
        <span
          v-if="!dense && item.assignee"
          class="work-card__assignee"
          role="img"
          :title="item.assignee"
          :aria-label="t('workBoard.card.assignee', { name: item.assignee })"
          data-testid="work-card-assignee"
        >{{ initialsOf(item.assignee) }}</span>
        <span
          v-if="!dense && item.due_date"
          class="work-card__due"
          :class="{ 'work-card__due--overdue': overdue }"
          :title="t(overdue ? 'workBoard.card.overdue' : 'workBoard.card.due', { date: dueText })"
          data-testid="work-card-due"
        >
          <VIcon icon="mdi-calendar-outline" size="14" aria-hidden="true" />{{ dueText }}
        </span>
        <span
          v-if="days !== null"
          class="work-card__days"
          :class="{ 'work-card__days--stale': stale }"
          :title="t('workBoard.card.daysInColumn', { n: days })"
          data-testid="work-card-days"
        >{{ t("workBoard.card.days", { n: days }) }}</span>
      </span>
      <span v-if="links.length" class="work-card__links">
        <a
          v-for="link in links"
          :key="link.kind"
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="work-card__link"
          :class="link.kind === 'ci' && link.state ? `work-card__link--${link.state}` : undefined"
          :title="linkText(link)"
          :aria-label="linkText(link)"
          :data-testid="`work-card-link-${link.kind}`"
        ><VIcon :icon="linkIcon(link)" size="16" aria-hidden="true" /></a>
      </span>
    </span>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  GIT_ICONS,
  HOLD_LABEL,
  SESSION_LABEL,
  cardLinks,
  checklistProgress,
  daysInColumn,
  gitMarker,
  initialsOf,
  isLive,
  isOverdue,
  isStale,
  outOfStep,
  shownLabels,
} from "../../composables/useWorkBoard";
import WorkLabelChip from "./WorkLabelChip.vue";
import { useWorkBoardContext } from "./workBoardContext";
import type { WorkItem, WorkLink, WorkLinkKind } from "../../types/workBoard";

/**
 * One board card: KEY-n, priority, title, where the code is (CORE-221), its labels, and a footer
 * with the assignee, the due date, the days in this column and the spec/artifact/PR/CI links as
 * icons (CORE-219). A robot marks a ticket a Claude session created; the green dot means a session
 * touched it in the last 15 minutes. Compact density keeps the key, the title and one row of
 * marks: a dot per label, where the code is, on hold, the days and the links.
 * `[` / `]` on a focused card ask the board to move it one column left / right; clicking a label
 * asks it to filter by that label.
 */
const props = withDefaults(defineProps<{ item: WorkItem; draggable?: boolean }>(), { draggable: true });
const emit = defineEmits<{ open: [key: string]; move: [key: string, step: -1 | 1]; label: [name: string] }>();
const { t, locale } = useI18n();
const board = useWorkBoardContext();
const dense = computed(() => board.dense.value);
/** Labels a card shows before "+n". */
const MAX_CHIPS = 3;
const dragging = ref(false);
/** How much of "Done when" is ticked (CORE-195); null when it isn't a checklist. */
const progress = computed(() => checklistProgress(props.item.done_when));
const git = computed(() => gitMarker(props.item));
/** Status and git disagree; the marker turns into a warning. */
const alert = computed(() => outOfStep(props.item));
const held = computed(() => props.item.status === "needs_review" && props.item.labels.includes(HOLD_LABEL));

const links = computed(() => cardLinks(props.item));
const labels = computed(() => shownLabels(props.item));
const fromSession = computed(() => props.item.labels.includes(SESSION_LABEL));
const live = computed(() => isLive(props.item.session_active_at, board.now.value));
const sessionText = computed(() => t(live.value ? "workBoard.session.live" : "workBoard.session.badge"));

const closed = computed(() => props.item.status === "done" || props.item.status === "canceled");
/** Days in the column, once there is a full one to count; a closed item stops counting. */
const days = computed(() => {
  const n = daysInColumn(props.item, board.now.value);
  return closed.value || n < 1 ? null : n;
});
const stale = computed(() => isStale(props.item, board.now.value));
const overdue = computed(() => isOverdue(props.item, board.now.value));
const dueText = computed(() =>
  props.item.due_date
    ? new Date(`${props.item.due_date}T00:00:00`).toLocaleDateString(locale.value === "mx" ? "es-MX" : locale.value, { day: "numeric", month: "short" })
    : "",
);
const showMeta = computed(() =>
  dense.value
    ? labels.value.length > 0 || git.value !== null || held.value || days.value !== null
    : !!props.item.assignee || !!props.item.due_date || days.value !== null,
);

const LINK_ICONS: Record<WorkLinkKind, string> = {
  spec: "mdi-file-document-outline",
  artifact: "mdi-shape-outline",
  pr: "mdi-source-pull",
  ci: "mdi-circle-outline",
  other: "mdi-link-variant",
};

function linkIcon(link: WorkLink): string {
  if (link.kind === "ci" && link.state) return link.state === "passed" ? "mdi-check-circle" : "mdi-close-circle";
  return LINK_ICONS[link.kind];
}

function linkText(link: WorkLink): string {
  return link.kind === "ci" && link.state ? t(`workBoard.ci.${link.state}`) : t(`workBoard.link.${link.kind}`);
}

function onDragStart(event: DragEvent): void {
  dragging.value = true;
  event.dataTransfer?.setData("text/plain", props.item.key);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "[" || event.key === "]") {
    event.preventDefault();
    emit("move", props.item.key, event.key === "[" ? -1 : 1);
  }
}
</script>

<style scoped>
.work-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.work-card:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.24);
}

.work-card__open {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: start;
  background: none;
  border: 0;
  cursor: pointer;
}

.work-card__open:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 6px;
  border-radius: 4px;
}

.work-card--dragging {
  opacity: 0.5;
}

.work-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.work-card__key {
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__priority {
  padding: 0 8px;
  font-size: 0.75rem;
  line-height: 20px;
  border-radius: 4px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.work-card__priority--p1 {
  color: rgb(var(--v-theme-on-error));
  background: rgb(var(--v-theme-error));
}

.work-card__priority--p2 {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.work-card__progress {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__progress--complete {
  color: rgb(var(--v-theme-success));
}

.work-card__marks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.work-card__git {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__git--alert {
  color: rgb(var(--v-theme-warning));
}

.work-card__title {
  font-size: 0.875rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.work-card__id {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.work-card__session {
  position: relative;
  display: inline-flex;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__live {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface));
}

.work-card__labels {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}

.work-card__more {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  margin-top: 4px;
}

.work-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.work-card__dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.work-card__assignee {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 50%;
}

.work-card__due {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.work-card__due--overdue {
  color: rgb(var(--v-theme-error));
}

.work-card__days--stale {
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}

.work-card__links {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.work-card__link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  border-radius: 6px;
}

.work-card__link:hover {
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.08);
}

.work-card__link--passed {
  color: rgb(var(--v-theme-success));
}

.work-card__link--failed {
  color: rgb(var(--v-theme-error));
}

.work-card--dense {
  padding: 8px 12px;
}
</style>
