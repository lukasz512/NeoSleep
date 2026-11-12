<template>
  <article
    class="work-card"
    :class="{ 'work-card--dragging': dragging }"
    :draggable="draggable"
    :data-testid="`work-card-${item.key}`"
    @dragstart="onDragStart"
    @dragend="dragging = false"
  >
    <button type="button" class="work-card__open" :aria-label="`${item.key} ${item.title}`" @click="emit('open', item.key)" @keydown="onKeydown">
      <span class="work-card__top">
        <span class="work-card__key">{{ item.key }}</span>
        <span v-if="item.priority" class="work-card__priority" :class="`work-card__priority--p${item.priority}`" :title="t(`workBoard.priority.p${item.priority}`)">
          {{ t(`workBoard.priority.short.p${item.priority}`) }}
        </span>
      </span>
      <span class="work-card__title">{{ item.title }}</span>
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
import { CARD_LINK_KINDS, linkOf } from "../../composables/useWorkBoard";
import type { WorkItem, WorkLinkKind } from "../../types/workBoard";

/**
 * One board card: KEY-n, priority, title, and the spec/artifact/PR/CI links that exist.
 * `[` / `]` on a focused card ask the board to move it one column left / right.
 */
const props = withDefaults(defineProps<{ item: WorkItem; draggable?: boolean }>(), { draggable: true });
const emit = defineEmits<{ open: [key: string]; move: [key: string, step: -1 | 1] }>();
const { t } = useI18n();
const dragging = ref(false);

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
