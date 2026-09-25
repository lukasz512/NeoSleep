<template>
  <nav ref="root" class="app-breadcrumbs" :aria-label="t('app.common.breadcrumbs')" :aria-busy="loading ? 'true' : undefined">
    <ol class="app-breadcrumbs__list">
      <li
        v-for="(item, i) in items"
        :key="i"
        class="app-breadcrumbs__item"
        :class="{ 'app-breadcrumbs__item--record': !!item.avatar }"
        :aria-current="isCurrent(i) ? 'page' : undefined"
      >
        <AppIcon v-if="i > 0" name="chevron-right" class="app-breadcrumbs__sep" aria-hidden="true" />
        <VTooltip :disabled="!truncated[i]" location="bottom" :text="fullText(item)">
          <template #activator="{ props: tooltipProps }">
            <component
              :is="tagFor(item, i)"
              v-bind="{ ...tooltipProps, ...linkAttrs(item, i) }"
              class="app-breadcrumbs__crumb"
              :class="{ 'app-breadcrumbs__crumb--interactive': isInteractive(item, i) }"
            >
              <AppIcon v-if="item.icon" :name="item.icon" class="app-breadcrumbs__icon" aria-hidden="true" />
              <AppAvatar
                v-else-if="item.avatar"
                :name="item.avatar.name"
                :first-name="item.avatar.firstName"
                :last-name="item.avatar.lastName"
                :entity-type="item.avatar.entityType"
                :org-type="item.avatar.orgType"
                :size="22"
                class="app-breadcrumbs__avatar"
                aria-hidden="true"
              />
              <span class="app-breadcrumbs__label" data-crumb-label :data-crumb-index="i">{{ item.label }}</span>
              <span v-if="item.secondary" class="app-breadcrumbs__secondary">
                <span class="app-breadcrumbs__sr">{{ item.secondaryLabel ?? "" }}</span>
                {{ item.secondary }}
              </span>
            </component>
          </template>
        </VTooltip>
        <VChip
          v-if="item.status"
          :color="item.status.color"
          size="x-small"
          variant="tonal"
          class="app-breadcrumbs__status"
          label
        >
          {{ item.status.label }}
        </VChip>
      </li>
      <li v-if="loading" class="app-breadcrumbs__item app-breadcrumbs__item--loading">
        <AppIcon name="chevron-right" class="app-breadcrumbs__sep" aria-hidden="true" />
        <span class="app-breadcrumbs__skeleton" aria-hidden="true" />
        <span class="app-breadcrumbs__sr">{{ t("app.common.loading") }}</span>
      </li>
      <li v-if="trailingSeparator && !loading" class="app-breadcrumbs__item" aria-hidden="true">
        <AppIcon name="chevron-right" class="app-breadcrumbs__sep" />
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
/**
 * Medical-grade breadcrumbs (NEO-56): hierarchy (never click history), with
 * the record's avatar, a second identifier (e.g. date of birth) and any
 * exceptional status right in the trail, so the user always knows WHOSE
 * record they are in before reading anything else.
 *
 * - Stable: a skeleton holds the record's place while it loads, so nothing
 *   jumps when the name arrives.
 * - Long names ellipsize; the full text (name + identifier) is in a tooltip,
 *   shown only when something was actually cut off.
 * - The last crumb is the current page (aria-current, not interactive).
 */
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { useI18n } from "vue-i18n";
import AppIcon from "./AppIcon.vue";
import AppAvatar from "./AppAvatar.vue";
import type { BreadcrumbItem } from "./AppBreadcrumbs.types";

const props = withDefaults(
  defineProps<{
    items: BreadcrumbItem[];
    /** The record crumb is still loading — render a placeholder after the items. */
    loading?: boolean;
    /** End with a separator: the next crumb is rendered by the caller (lead detail's inline name). */
    trailingSeparator?: boolean;
  }>(),
  { loading: false, trailingSeparator: false },
);

const { t } = useI18n();

const truncated = reactive<Record<number, boolean>>({});

function isCurrent(i: number): boolean {
  return !props.loading && !props.trailingSeparator && i === props.items.length - 1;
}

function isInteractive(item: BreadcrumbItem, i: number): boolean {
  return !isCurrent(i) && (!!item.to || !!item.action);
}

function tagFor(item: BreadcrumbItem, i: number) {
  if (!isInteractive(item, i)) return "span";
  return item.to ? RouterLink : "button";
}

function linkAttrs(item: BreadcrumbItem, i: number): Record<string, unknown> {
  if (!isInteractive(item, i)) return {};
  if (item.to) return { to: item.to };
  return { type: "button", onClick: item.action };
}

function fullText(item: BreadcrumbItem): string {
  return item.secondary ? `${item.label} · ${item.secondary}` : item.label;
}

// Which labels are actually cut off — measured up front and on every resize
// (not on hover: a tooltip enabled mid-hover wouldn't open until the next one).
const root = ref<HTMLElement | null>(null);
function measure() {
  for (const label of root.value?.querySelectorAll<HTMLElement>("[data-crumb-label]") ?? []) {
    truncated[Number(label.dataset.crumbIndex)] = label.scrollWidth > label.clientWidth;
  }
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && root.value) {
    observer = new ResizeObserver(measure);
    observer.observe(root.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.items, () => nextTick(measure), { deep: true });
</script>

<style scoped>
.app-breadcrumbs {
  min-width: 0;
}

.app-breadcrumbs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  font-size: 0.9375rem;
  line-height: 1.3;
}

.app-breadcrumbs__item {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex-shrink: 0;
}
/* The record crumb is the one that gives way when space runs out. */
.app-breadcrumbs__item--record {
  flex-shrink: 1;
}

.app-breadcrumbs__sep {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin: 0 2px;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.app-breadcrumbs__crumb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  /* A fixed 44px touch target (Apple HIG / WCAG 2.5.5), not the 40px desktop
     button token: breadcrumbs show from 768px up, i.e. on tablets too, which
     reps tap with a finger. */
  min-height: 44px;
  padding: 0 8px;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  font: inherit;
  background: none;
  border: 0;
  text-decoration: none;
}

.app-breadcrumbs__crumb--interactive {
  color: rgb(var(--v-theme-primary));
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.app-breadcrumbs__crumb--interactive:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}
.app-breadcrumbs__crumb--interactive:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.app-breadcrumbs__item[aria-current="page"] .app-breadcrumbs__crumb {
  font-weight: 600;
}

.app-breadcrumbs__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.app-breadcrumbs__avatar {
  flex-shrink: 0;
}

.app-breadcrumbs__label {
  min-width: 0;
  max-width: 32ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-breadcrumbs__secondary {
  flex-shrink: 0;
  white-space: nowrap;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
.app-breadcrumbs__secondary::before {
  content: "·";
  margin-right: 6px;
}

.app-breadcrumbs__status {
  flex-shrink: 0;
  margin-left: 2px;
}

.app-breadcrumbs__skeleton {
  display: inline-block;
  width: 160px;
  height: 14px;
  margin: 0 8px;
  border-radius: 7px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}
@media (prefers-reduced-motion: no-preference) {
  .app-breadcrumbs__skeleton {
    animation: app-breadcrumbs-pulse 1.4s ease-in-out infinite;
  }
  @keyframes app-breadcrumbs-pulse {
    50% { opacity: 0.45; }
  }
}

.app-breadcrumbs__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
