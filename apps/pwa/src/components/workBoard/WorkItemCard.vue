<template>
  <article
    class="work-card"
    :class="{ 'work-card--dragging': dragging, 'work-card--urgent': item.priority === 1 }"
    :draggable="draggable"
    :data-testid="`work-card-${item.key}`"
    @dragstart="onDragStart"
    @dragend="dragging = false"
  >
    <button type="button" class="work-card__open" :aria-label="`${item.key} ${item.title}`" @click="emit('open', item.key)" @keydown="onKeydown">
      <span class="work-card__top">
        <span class="work-card__key">{{ item.key }}</span>
        <span v-if="item.priority" class="work-card__priority" :title="t(`workBoard.priority.p${item.priority}`)" data-testid="work-card-priority">
          <WorkPriorityMark :priority="item.priority" :label="t(`workBoard.priority.p${item.priority}`)" />
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
      <span v-if="git || held" class="work-card__marks">
        <span v-if="git" class="work-card__git" :class="{ 'work-card__git--alert': alert }" data-testid="work-card-git">
          <VIcon :icon="GIT_ICONS[git]" size="14" aria-hidden="true" />{{ t(`workBoard.git.${git}`) }}
        </span>
        <span v-if="held" class="work-card__git" data-testid="work-card-hold">
          <VIcon icon="mdi-pause-circle-outline" size="14" aria-hidden="true" />{{ t("workBoard.hold.on") }}
        </span>
      </span>
    </button>
    <span v-if="links.length" class="work-card__links">
      <a
        v-for="link in links"
        :key="link.kind"
        :href="link.url"
        target="_blank"
        rel="noopener"
        class="work-card__link"
        :data-testid="`work-card-link-${link.kind}`"
      >{{ t(`workBoard.link.${link.kind}`) }}</a>
    </span>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import WorkPriorityMark from "./WorkPriorityMark.vue";
import { WORK_URGENT_COLOR } from "./workGlyphs";
import { CARD_LINK_KINDS, GIT_ICONS, HOLD_LABEL, checklistProgress, gitMarker, linkOf, outOfStep } from "../../composables/useWorkBoard";
import type { WorkItem, WorkLinkKind } from "../../types/workBoard";

/**
 * One board card: KEY-n, priority, title, where the code is (CORE-221), and the
 * spec/artifact/PR/CI links that exist.
 * `[` / `]` on a focused card ask the board to move it one column left / right.
 */
const props = withDefaults(defineProps<{ item: WorkItem; draggable?: boolean }>(), { draggable: true });
const emit = defineEmits<{ open: [key: string]; move: [key: string, step: -1 | 1] }>();
const { t } = useI18n();
const dragging = ref(false);
/** How much of "Done when" is ticked (CORE-195); null when it isn't a checklist. */
const progress = computed(() => checklistProgress(props.item.done_when));
const git = computed(() => gitMarker(props.item));
/** Status and git disagree; the marker turns into a warning. */
const alert = computed(() => outOfStep(props.item));
const held = computed(() => props.item.status === "needs_review" && props.item.labels.includes(HOLD_LABEL));

const links = computed(() =>
  CARD_LINK_KINDS.map((kind) => ({ kind, url: linkOf(props.item, kind) })).filter(
    (l): l is { kind: WorkLinkKind; url: string } => l.url !== null,
  ),
);

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
  display: inline-flex;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

/* Urgent is the one priority that marks the whole card (CORE-225). */
.work-card--urgent {
  box-shadow: inset 3px 0 0 v-bind(WORK_URGENT_COLOR);
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

.work-card__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.work-card__link {
  font-size: 0.75rem;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.work-card__link:hover {
  text-decoration: underline;
}
</style>
