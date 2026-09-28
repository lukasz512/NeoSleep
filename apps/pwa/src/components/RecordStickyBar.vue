<template>
  <!-- Stays in the page only to read the layout's sizes (app bar height,
       sheet edges, gutter) the bar itself can no longer inherit. -->
  <span ref="home" class="record-bar-home" aria-hidden="true" />
  <!-- Fixed, not sticky: a sticky bar's home is the top of the page, so
       anything scrolling it into view (focus returning to "⋯" when its menu
       closes) would scroll the page back up to the header. And moved to the
       app root, because a transformed ancestor (the app shell's entrance
       animation translates the content) turns "fixed" into "scrolls along". -->
  <Teleport :to="teleportTarget ?? 'body'" :disabled="!teleportTarget">
    <div
      class="record-bar"
      :class="{ 'record-bar--visible': visible }"
      :style="layoutVars"
      :inert="!visible || undefined"
      :aria-hidden="!visible || undefined"
      data-testid="record-sticky-bar"
    >
      <div v-if="$slots.avatar" class="record-bar__avatar" aria-hidden="true">
        <slot name="avatar" />
      </div>
      <p
        ref="titleEl"
        class="record-bar__title"
        data-testid="record-sticky-bar-title"
      >
        {{ title }}
      </p>
      <AppButton
        v-if="primary"
        icon
        variant="text"
        class="record-bar__btn"
        :class="`record-bar__btn--${primary.tone}`"
        :aria-label="primary.label"
        :disabled="primary.disabled"
        data-testid="record-sticky-bar-primary"
        @click="primary.button.click()"
      >
        <span
          :ref="(el) => mountIcon(el, primary!.icon)"
          class="record-bar__icon"
        />
      </AppButton>
      <VMenu v-if="rest.length" v-model="menuOpen" location="bottom end">
        <template #activator="{ props: menuProps }">
          <AppButton
            v-bind="menuProps"
            icon
            variant="text"
            class="record-bar__btn"
            :aria-label="t('app.common.moreActions')"
            data-testid="record-sticky-bar-more"
          >
            <AppIcon name="dots-vertical" class="record-bar__icon" />
          </AppButton>
        </template>
        <VList class="record-bar__menu" density="comfortable">
          <VListItem
            v-for="action in rest"
            :key="action.key"
            :title="action.label"
            :disabled="action.disabled"
            :class="{ 'record-bar__menu-item--error': action.tone === 'error' }"
            data-testid="record-sticky-bar-menu-item"
            @click="run(action)"
          >
            <template #prepend>
              <span
                :ref="(el) => mountIcon(el, action.icon)"
                class="pwa-action-icon"
                :class="toneIconClass(action.tone)"
              />
            </template>
          </VListItem>
        </VList>
      </VMenu>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * NEO-158, phones only: once the record header has scrolled away under the
 * app bar, a slim bar takes its place at the top — the record's name on one
 * line, its main action, and "⋯" with every other action, labeled, the
 * destructive ones last. Scrolling back up hides it again.
 *
 * The actions are not declared twice: the bar mirrors the header's own
 * buttons (label from their aria-label, icon and tone from their markup) and
 * a tap here clicks the original, so every view's handlers, permissions and
 * loading states apply unchanged. The original row stays in the DOM, just
 * scrolled out of view.
 */
import {
  computed,
  onBeforeUnmount,
  ref,
  toRef,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { useEventListener } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { VList, VListItem, VMenu } from "vuetify/components";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import { useFitTitle } from "../composables/useFitTitle";
import {
  mirrorActions,
  splitActions,
  type MirroredAction,
} from "./recordBarActions";

const props = defineProps<{
  /** The record's name. */
  title: string;
  /** The record header: the bar shows once it has scrolled out under the app bar. */
  header: HTMLElement | null;
  /** The header's actions row, whose buttons the bar mirrors. */
  actions: HTMLElement | null;
}>();

const { t } = useI18n();

// The name keeps to one line here too: 16 px, down to 14 px, then "…".
const titleEl = ref<HTMLElement | null>(null);
useFitTitle(titleEl, toRef(props, "title"), 14);

const home = ref<HTMLElement | null>(null);
/** The Vuetify app root: inside the theme (colors), outside every transformed ancestor. */
const teleportTarget =
  typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>(".v-application");
const layoutVars = ref<Record<string, string>>({});
const visible = ref(false);
const menuOpen = ref(false);
const actionList = ref<MirroredAction[]>([]);
const split = computed(() => splitActions(actionList.value));
const primary = computed(() => split.value.primary);
const rest = computed(() => split.value.rest);

let intersection: IntersectionObserver | null = null;
let mutations: MutationObserver | null = null;

/**
 * The layout values the bar sits on, read where the page is: the app bar's
 * height (Vuetify's --v-layout-top), the phone sheet's side margin and the
 * page gutter (AppLayout). Returns the app bar's height in px.
 */
function readLayout(): number {
  if (!home.value) return 56;
  const cs = getComputedStyle(home.value);
  const read = (name: string) => cs.getPropertyValue(name).trim();
  const vars: Record<string, string> = {};
  const top = read("--v-layout-top");
  const edge = read("--layout-sheet-margin");
  const inset = read("--layout-card-inset");
  if (top) vars["--record-bar-top"] = top;
  if (edge) vars["--record-bar-edge"] = edge;
  if (inset) vars["--record-bar-inset"] = inset;
  layoutVars.value = vars;
  return parseFloat(top) || 56;
}

function watchHeader(header: HTMLElement | null) {
  intersection?.disconnect();
  intersection = null;
  visible.value = false;
  if (!header || typeof IntersectionObserver === "undefined") return;
  const top = readLayout();
  intersection = new IntersectionObserver(
    ([entry]) => {
      // Gone *above* the bar — not merely below the fold on a short screen.
      visible.value =
        !!entry && !entry.isIntersecting && entry.boundingClientRect.top < top;
      if (!visible.value) menuOpen.value = false;
    },
    { rootMargin: `-${top}px 0px 0px 0px` },
  );
  intersection.observe(header);
}

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

watch(
  () => [props.header, home.value] as const,
  ([header]) => watchHeader(header),
  { flush: "post", immediate: true },
);
// Rotation / a resize can change the app bar and the gutter.
useEventListener("resize", () => watchHeader(props.header), { passive: true });
watch(() => props.actions, watchActions, { flush: "post", immediate: true });
onBeforeUnmount(() => {
  intersection?.disconnect();
  mutations?.disconnect();
});

/** Puts a copy of the original button's glyph in place (same icon, no second source of truth). */
function mountIcon(
  el: Element | ComponentPublicInstance | null,
  icon: SVGElement | null,
) {
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
.record-bar-home {
  display: none;
}

.record-bar {
  position: fixed;
  top: var(--record-bar-top, 56px);
  /* Over the phone sheet, edge to edge (AppLayout --layout-sheet-margin). */
  left: var(--record-bar-edge, 8px);
  right: var(--record-bar-edge, 8px);
  z-index: 4;
  height: 56px;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  /* The last button's glyph ends on the page's content edge, as in the header. */
  padding-inline: var(--record-bar-inset, 16px)
    calc(var(--record-bar-inset, 16px) - 12px);
  background: var(--pwa-sheet, rgb(var(--v-theme-surface)));
  box-shadow: inset 0 -1px 0
    var(--pwa-rule, rgba(var(--v-theme-on-surface), 0.12));
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  visibility: hidden;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    visibility 0s linear 160ms;
}

.record-bar--visible {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  visibility: visible;
  transition:
    opacity 160ms ease,
    transform 160ms ease,
    visibility 0s;
}

@media (prefers-reduced-motion: reduce) {
  .record-bar,
  .record-bar--visible {
    transform: none;
    transition: none;
  }
}

/* The header's 48 px avatar, drawn at 32 px. */
.record-bar__avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
}
.record-bar__avatar > :deep(*) {
  transform: scale(0.6667);
  transform-origin: top left;
}
/* On the narrowest phones (320 px) the name needs that room more. */
@media (max-width: 359.98px) {
  .record-bar__avatar {
    display: none;
  }
}

/* Always one line: a name too long for the bar ends in "…". */
.record-bar__title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}

.record-bar__btn {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
}
.record-bar__btn--success {
  color: rgb(var(--v-theme-success));
}
.record-bar__btn--primary {
  color: rgb(var(--v-theme-primary));
}

.record-bar__icon {
  width: 22px;
  height: 22px;
  display: block;
}
.record-bar__icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.record-bar__menu :deep(.v-list-item) {
  min-height: 48px;
}
.record-bar__menu :deep(.v-list-item__prepend) {
  margin-inline-end: 14px;
}
.record-bar__menu :deep(.v-list-item__prepend .v-list-item__spacer) {
  width: 0;
}
.record-bar__menu :deep(.pwa-action-icon svg) {
  width: 100%;
  height: 100%;
  display: block;
}
.record-bar__menu-item--error {
  color: rgb(var(--v-theme-error));
}
</style>
