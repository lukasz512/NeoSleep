<template>
  <!-- NEO-181, phones: the record's top bar, there from the start. ‹ + the
       module name on the left, the main action and "⋯" (everything else,
       labeled, delete last) on the right. Once the header collapses, its
       avatar and name dock between them (useRecordHeaderCollapse).
       Three layers: the background (below the header), the header
       (transparent), then this row's controls (above the header). -->
  <div class="record-toolbar-bg" aria-hidden="true" />
  <div class="record-toolbar" data-testid="record-toolbar">
    <RouterLink
      v-if="back"
      :to="back.to"
      class="record-toolbar__back"
      :aria-label="back.label"
      data-testid="record-toolbar-back"
    >
      <AppIcon name="chevron-left" class="record-toolbar__chevron" />
      <span class="record-toolbar__back-label" aria-hidden="true">{{ back.label }}</span>
    </RouterLink>
    <div class="record-toolbar__actions">
      <template v-if="actionList.length">
        <AppButton
          v-if="primary"
          icon
          variant="text"
          class="record-toolbar__btn"
          :class="`record-toolbar__btn--${primary.tone}`"
          :aria-label="primary.label"
          :disabled="primary.disabled"
          data-testid="record-toolbar-primary"
          @click="primary.button.click()"
        >
          <span :ref="(el) => mountIcon(el, primary!.icon)" class="record-toolbar__icon" />
        </AppButton>
        <VMenu v-if="rest.length" v-model="menuOpen" location="bottom end">
          <template #activator="{ props: menuProps }">
            <AppButton
              v-bind="menuProps"
              icon
              variant="text"
              class="record-toolbar__btn"
              :aria-label="t('app.common.moreActions')"
              data-testid="record-toolbar-more"
            >
              <AppIcon name="dots-vertical" class="record-toolbar__icon" />
            </AppButton>
          </template>
          <VList class="record-toolbar__menu" density="comfortable">
            <VListItem
              v-for="action in rest"
              :key="action.key"
              :title="action.label"
              :disabled="action.disabled"
              :class="{ 'record-toolbar__menu-item--error': action.tone === 'error' }"
              data-testid="record-toolbar-menu-item"
              @click="run(action)"
            >
              <template #prepend>
                <span :ref="(el) => mountIcon(el, action.icon)" class="pwa-action-icon" :class="toneIconClass(action.tone)" />
              </template>
            </VListItem>
          </VList>
        </VMenu>
      </template>
      <template v-else-if="skeletons > 0">
        <span v-for="n in Math.min(skeletons, 2)" :key="n" class="record-toolbar__skeleton" aria-hidden="true" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NEO-181: the phone record toolbar. The actions are not declared twice: the
 * toolbar mirrors the header's own (visually hidden) buttons — label from
 * their aria-label, icon and tone from their markup — and a tap here clicks
 * the original, so every view's handlers, permissions and loading states
 * apply unchanged.
 */
import { computed, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";
import { VList, VListItem, VMenu } from "vuetify/components";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import type { BreadcrumbItem } from "./AppBreadcrumbs.types";
import { mirrorActions, splitActions, type MirroredAction } from "./recordBarActions";

const props = withDefaults(
  defineProps<{
    /** The parent list: ‹ + its name, the way back. */
    back: BreadcrumbItem | null;
    /** The header's (hidden) actions row, whose buttons the toolbar mirrors. */
    actions: HTMLElement | null;
    /** While the record loads: how many action placeholders to hold (max 2 shown). */
    skeletons?: number;
  }>(),
  { skeletons: 0 },
);

const { t } = useI18n();

const menuOpen = ref(false);
const actionList = ref<MirroredAction[]>([]);
const split = computed(() => splitActions(actionList.value));
const primary = computed(() => split.value.primary);
const rest = computed(() => split.value.rest);

let mutations: MutationObserver | null = null;

function watchActions(container: HTMLElement | null) {
  mutations?.disconnect();
  mutations = null;
  actionList.value = container ? mirrorActions(container) : [];
  if (!container || typeof MutationObserver === "undefined") return;
  // A view can add, remove, disable or relabel an action at any time (an
  // "Activate" that disappears once used, a button that is loading).
  mutations = new MutationObserver(() => {
    actionList.value = mirrorActions(container);
  });
  mutations.observe(container, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "disabled", "aria-disabled", "class"],
  });
}

watch(() => props.actions, watchActions, { flush: "post", immediate: true });
onBeforeUnmount(() => mutations?.disconnect());

/** Puts a copy of the original button's glyph in place (same icon, no second source of truth). */
function mountIcon(el: Element | ComponentPublicInstance | null, icon: SVGElement | null) {
  if (!(el instanceof HTMLElement)) return;
  el.replaceChildren(...(icon ? [icon.cloneNode(true)] : []));
}

function toneIconClass(tone: MirroredAction["tone"]): string {
  return tone === "neutral" ? "" : `pwa-action-icon--${tone}`;
}

function run(action: MirroredAction) {
  menuOpen.value = false;
  action.button.click();
}
</script>

<style scoped>
/* Both rows pin under the app bar, across the sheet's full width. */
.record-toolbar-bg,
.record-toolbar {
  position: sticky;
  top: var(--v-layout-top, 56px);
  height: 48px;
  margin-inline: calc(-1 * var(--layout-card-inset, 16px));
}
.record-toolbar-bg {
  z-index: 4;
  background: var(--pwa-sheet, rgb(var(--v-theme-surface)));
}
/* The hairline that appears once the header has docked. */
.record-toolbar-bg::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 1px;
  background: var(--pwa-rule, rgba(var(--v-theme-on-surface), 0.12));
  opacity: var(--rh-rule, 0);
}
/* Overlays the background row (not a second 48 px of space). */
.record-toolbar {
  z-index: 6;
  margin-top: -48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: calc(var(--layout-card-inset, 16px) - 12px) calc(var(--layout-card-inset, 16px) - 12px);
  pointer-events: none;
}
.record-toolbar > * {
  pointer-events: auto;
}

.record-toolbar__back {
  display: inline-flex;
  align-items: center;
  height: 44px;
  padding-inline: 2px 8px;
  border-radius: 10px;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.record-toolbar__back:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 2px;
}
.record-toolbar__chevron {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.record-toolbar__back-label {
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  /* Collapses to nothing as the header docks, so the link shrinks to ‹ alone
     and a tap on the docked name doesn't count as "back". */
  max-width: 12rem;
}

.record-toolbar__actions {
  display: flex;
  align-items: center;
}
.record-toolbar__btn {
  width: 44px;
  height: 44px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}
.record-toolbar__btn--success {
  color: rgb(var(--v-theme-success));
}
.record-toolbar__btn--primary {
  color: rgb(var(--v-theme-primary));
}
.record-toolbar__icon {
  width: 22px;
  height: 22px;
  display: block;
}
.record-toolbar__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.record-toolbar__skeleton {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
}
.record-toolbar__skeleton::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.record-toolbar__menu :deep(.v-list-item) {
  min-height: 48px;
}
.record-toolbar__menu :deep(.v-list-item__prepend) {
  margin-inline-end: 14px;
}
.record-toolbar__menu :deep(.v-list-item__prepend .v-list-item__spacer) {
  width: 0;
}
.record-toolbar__menu :deep(.pwa-action-icon svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.record-toolbar__menu-item--error {
  color: rgb(var(--v-theme-error));
}

/* NEO-181: driven by the page scroll itself (see useRecordHeaderCollapse):
   the label clears the way before the avatar docks next to ‹, the hairline
   appears once the header has docked. */
@keyframes record-toolbar-label-out {
  to {
    opacity: 0;
    max-width: 0;
  }
}
@keyframes record-toolbar-rule-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@supports (animation-timeline: scroll()) {
  .record-toolbar__back-label {
    animation: record-toolbar-label-out linear both;
    animation-timeline: scroll(root block);
    animation-range: var(--rh-start, 0px) calc(var(--rh-start, 0px) + var(--rh-label, 32px));
  }
  .record-toolbar-bg::after {
    animation: record-toolbar-rule-in linear both;
    animation-timeline: scroll(root block);
    animation-range: calc(var(--rh-start, 0px) + var(--rh-R, 0px) - 12px) calc(var(--rh-start, 0px) + var(--rh-R, 0px));
  }
}
</style>
