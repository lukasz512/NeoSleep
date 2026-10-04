<template>
  <!-- CORE-4: the bell opens the same "Kropla" glass card as the account
       menu (AppGlassPopover, D4): the bell flies into the card's corner, the
       card springs out, swipe up closes it on phones. The list scrolls inside
       the card, so the swipe starts only on the header and the handle. -->
  <AppGlassPopover
    v-model:open="open"
    :mobile="mobile"
    :label="t('notificationCenter.title')"
    test-id="notification-center"
    :width="CARD_WIDTH"
    :anchor-size="ANCHOR_SIZE"
    swipe-from="handle"
  >
    <template #trigger="{ open: isOpen }">
      <AppButton
        icon
        variant="text"
        class="notif-center__bell"
        ignore-global-loading
        :title="t('notificationCenter.bell.label')"
        :aria-label="unreadCount > 0
          ? t('notificationCenter.bell.labelWithCount', { count: unreadCount })
          : t('notificationCenter.bell.label')"
        aria-haspopup="dialog"
        :aria-expanded="isOpen"
      >
        <span class="notif-center__bell-wrap" data-motion="trigger-avatar">
          <AppIcon name="bell" class="notif-center__bell-icon" />
          <span v-if="badge" class="notif-center__badge" aria-hidden="true">{{ badge }}</span>
        </span>
      </AppButton>
    </template>

    <header class="notif-center__head" data-glass-swipe>
      <div class="notif-center__heading">
        <h2 class="notif-center__title" data-motion="name">{{ t("notificationCenter.title") }}</h2>
        <p class="notif-center__summary" data-motion="role">
          {{ unreadCount > 0 ? t("notificationCenter.summary.unread", { count: unreadCount }) : t("notificationCenter.summary.caughtUp") }}
        </p>
      </div>
      <span class="notif-center__anchor" data-motion="avatar" aria-hidden="true">
        <AppIcon name="bell" />
      </span>
    </header>

    <div class="notif-center__toolbar" data-motion="extra">
      <div class="notif-center__toggle" role="tablist">
        <button
          v-for="value in FILTERS"
          :key="value"
          type="button"
          role="tab"
          :aria-selected="filter === value"
          :class="['notif-center__toggle-btn', { 'notif-center__toggle-btn--active': filter === value }]"
          @click="setFilter(value)"
        >
          {{ t(`notificationCenter.filter.${value}`) }}
        </button>
      </div>
      <button v-if="unreadCount > 0" type="button" class="notif-center__mark-all" @click="onMarkAllRead">
        {{ t("notificationCenter.markAllRead") }}
      </button>
    </div>

    <div class="notif-center__list" data-glass-scroll>
      <p v-if="loading && items.length === 0" class="notif-center__state">{{ t("layout.loader.label") }}</p>
      <p v-else-if="loadError" class="notif-center__state">
        {{ t("notificationCenter.error.load") }} {{ loadFailureText?.body }} {{ loadFailureText?.reference }}
      </p>
      <p v-else-if="items.length === 0" class="notif-center__state">
        {{ filter === "unread" ? t("notificationCenter.empty.unread") : t("notificationCenter.empty.all") }}
      </p>
      <template v-else>
        <section v-for="group in groups" :key="group.key" class="notif-center__group" data-motion="row">
          <h3 class="notif-center__group-title" :class="{ 'notif-center__group-title--action': group.key === 'needsAction' }">
            {{ t(`notificationCenter.group.${group.key}`) }}
          </h3>
          <ul class="notif-center__items">
            <li
              v-for="item in group.items"
              :key="item.id"
              class="notif-row"
              :class="{ 'notif-row--unread': !item.readAt }"
              :data-testid="`notif-row-${item.id}`"
            >
              <span v-if="rowSwipe?.id === item.id && rowSwipe.active" class="notif-row__reveal" aria-hidden="true">
                <AppIcon name="check" />{{ t("notificationCenter.swipe.read") }}
              </span>
              <div
                class="notif-row__swipe"
                :class="{ 'notif-row__swipe--dragging': rowSwipe?.id === item.id && rowSwipe.active }"
                @pointerdown="onRowPointerDown($event, item)"
                @click.capture="onRowClickCapture"
              >
                <component
                  :is="item.actionUrl ? RouterLink : 'button'"
                  v-bind="item.actionUrl ? { to: item.actionUrl } : { type: 'button' }"
                  class="notif-row__main"
                  draggable="false"
                  @click="onItemClick(item)"
                >
                  <span class="notif-row__icon" :class="`notif-row__icon--${view(item).tone}`">
                    <AppIcon :name="view(item).icon" />
                  </span>
                  <span class="notif-row__text">
                    <span class="notif-row__title">{{ rowTitle(item) }}</span>
                    <span v-if="rowContext(item)" class="notif-row__context">{{ rowContext(item) }}</span>
                  </span>
                  <span class="notif-row__meta">
                    <time class="notif-row__time" :datetime="item.createdAt">{{ rowTime(item) }}</time>
                    <span v-if="!item.readAt" class="notif-row__dot" aria-hidden="true" />
                  </span>
                </component>
                <div v-if="group.key === 'needsAction' && item.actions.length" class="notif-row__actions">
                  <component
                    :is="action.kind === 'call' ? 'a' : RouterLink"
                    v-for="action in item.actions"
                    :key="action.kind"
                    v-bind="action.kind === 'call' ? { href: action.href } : { to: action.href }"
                    class="notif-row__action"
                    :class="{ 'notif-row__action--primary': action.kind === 'call' }"
                    @click="onItemClick(item)"
                  >
                    <AppIcon :name="action.kind === 'call' ? 'phone' : 'calendar-clock'" />
                    {{ t(`notificationCenter.action.${action.kind}`) }}
                  </component>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </AppGlassPopover>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";
import { useErrorTextFor } from "@ui";
import AppButton from "./AppButton.vue";
import AppGlassPopover from "./AppGlassPopover.vue";
import AppIcon from "./AppIcon.vue";
import { useNotificationCenter, type CenterNotification } from "../composables/useNotificationCenter";
import { MOBILE_BREAKPOINT } from "../config/layout";
import { notificationTypeView, type NotificationTypeView } from "../config/notificationTypes";
import {
  badgeLabel,
  formatNotificationTime,
  groupNotifications,
  intlLocaleFor,
  swipeOutcome,
} from "../utils/notificationFeed";

/** Desktop card width (the account card is 340; the list needs a little more). */
const CARD_WIDTH = 380;
/** The bell tile in the card's top-right corner, where the app bar bell lands. */
const ANCHOR_SIZE = 40;
const FILTERS = ["all", "unread"] as const;
/** A move shorter than this is still a tap. */
const SWIPE_SLOP = 6;

const { t, te, locale } = useI18n();
// Polling lifecycle is owned by AppLayout.vue (always mounted for the whole
// session, CORE-4) — this component only renders the bell + its card; the
// unread count it reads is the same module-level state the nav badge dots
// read, so they always agree.
const { items, unreadCount, loading, loadError, loadFailure, fetchList, markRead, markAllRead } = useNotificationCenter();
const loadFailureText = useErrorTextFor(loadFailure);

const open = ref(false);
const filter = ref<(typeof FILTERS)[number]>("all");
/** "12 min" is measured from when the card opened, not per render. */
const now = ref(new Date());

// Same breakpoint as AppLayout's isMobile (useLayoutState), read on setup so
// the first open already uses the phone card.
const mobile = ref(typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT);
function onResize() {
  mobile.value = window.innerWidth < MOBILE_BREAKPOINT;
}
onMounted(() => window.addEventListener("resize", onResize));

const badge = computed(() => badgeLabel(unreadCount.value));
const groups = computed(() => groupNotifications(items.value, now.value));

watch(open, (isOpen) => {
  if (!isOpen) return;
  now.value = new Date();
  void fetchList(filter.value);
});

function setFilter(next: (typeof FILTERS)[number]) {
  filter.value = next;
  void fetchList(next);
}

function view(item: CenterNotification): NotificationTypeView {
  return notificationTypeView(item.type);
}

/** Short in-app copy (CORE-4 D1); the stored title (push copy) only for a type without one. */
function rowTitle(item: CenterNotification): string {
  const key = `notificationCenter.types.${item.type}`;
  return te(key) ? t(key) : item.title;
}

/** Who it is about, the visit time and how many events it folds — joined, never stored. */
function rowContext(item: CenterNotification): string {
  const parts: string[] = [];
  if (item.subjectName) parts.push(item.subjectName);
  if (item.subjectAt) {
    const at = new Date(item.subjectAt);
    if (!Number.isNaN(at.getTime())) {
      parts.push(at.toLocaleString(intlLocaleFor(locale.value), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
    }
  }
  if (item.groupCount > 1) parts.push(t("notificationCenter.grouped", { count: item.groupCount }));
  if (parts.length === 0 && !te(`notificationCenter.types.${item.type}`) && item.body) parts.push(item.body);
  return parts.join(" · ");
}

function rowTime(item: CenterNotification): string {
  return formatNotificationTime(item.createdAt, now.value, intlLocaleFor(locale.value), {
    now: t("notificationCenter.time.now"),
    minutes: (n) => t("notificationCenter.time.minutes", { n }),
  });
}

function onItemClick(item: CenterNotification) {
  void markRead(item.id);
  open.value = false;
}

function onMarkAllRead() {
  void markAllRead();
}

// ── Phone: swipe a row left to mark it read ─────────────────────────────────
const rowSwipe = ref<{ id: string; pointerId: number; x0: number; y0: number; dx: number; active: boolean; el: HTMLElement } | null>(null);
/** Set after a real drag so the click that follows pointerup doesn't open the row. */
let swallowClick = false;

function onRowPointerDown(e: PointerEvent, item: CenterNotification) {
  if (!mobile.value || e.button !== 0 || !(e.currentTarget instanceof HTMLElement)) return;
  rowSwipe.value = { id: item.id, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, active: false, el: e.currentTarget };
  window.addEventListener("pointermove", onRowPointerMove);
  window.addEventListener("pointerup", onRowPointerUp);
  window.addEventListener("pointercancel", onRowPointerUp);
}

function onRowPointerMove(e: PointerEvent) {
  const s = rowSwipe.value;
  if (!s || e.pointerId !== s.pointerId) return;
  const dx = e.clientX - s.x0;
  if (!s.active) {
    // a vertical move is the list scrolling, not a swipe
    if (Math.abs(dx) < SWIPE_SLOP || Math.abs(dx) < Math.abs(e.clientY - s.y0)) return;
    s.active = true;
  }
  s.dx = dx;
  // left follows the finger, right only gives a little (rubber band)
  s.el.style.transform = `translateX(${dx < 0 ? dx : dx / 4}px)`;
}

function endRowListeners() {
  window.removeEventListener("pointermove", onRowPointerMove);
  window.removeEventListener("pointerup", onRowPointerUp);
  window.removeEventListener("pointercancel", onRowPointerUp);
}

function onRowPointerUp(e: PointerEvent) {
  const s = rowSwipe.value;
  if (!s || e.pointerId !== s.pointerId) return;
  endRowListeners();
  rowSwipe.value = null;
  if (!s.active) return;
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  // springs back either way (the CSS transition carries it); a long swipe also marks it read
  s.el.style.transform = "";
  if (swipeOutcome(s.dx) === "read") void markRead(s.id);
}

function onRowClickCapture(e: MouseEvent) {
  if (!swallowClick) return;
  e.stopPropagation();
  e.preventDefault();
}

onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
  endRowListeners();
});
</script>

<style scoped>
/* CORE-4: a 44px touch target in the global app bar, same floor as the
   account button next to it (.layout-user-btn in AppLayout.vue), on both
   breakpoints — a plain icon button would otherwise fall back to Vuetify's
   smaller default. */
.notif-center__bell {
  min-width: 44px;
  min-height: 44px;
  /* CORE-134: VBtn clips everything outside the button (overflow: hidden),
     which cut the unread badge off at the bell's corner. */
  overflow: visible !important;
  transition: background-color 160ms ease;
}

/* Vuetify's hover/focus overlay relied on that clipping for its round
   shape; give it the button's radius itself. */
.notif-center__bell :deep(.v-btn__overlay),
.notif-center__bell :deep(.v-btn__underlay) {
  border-radius: inherit;
}

/* CORE-134 focus, same language as the account button (CORE-131 variant C):
   keyboard focus tints the circle with the brand color and fades in a brand
   ring on its edge — instead of Vuetify's grey overlay inside the global
   outline. Mouse clicks and taps never match :focus-visible. */
.notif-center__bell:focus-visible {
  outline: none;
  background-color: rgba(var(--v-theme-primary), 0.12);
}

.notif-center__bell:focus-visible :deep(> .v-btn__overlay) {
  opacity: 0;
}

/* Vuetify's own focus ring (::after, currentColor), recoloured and animated
   the way the avatar ring is; it sits under the badge. */
.notif-center__bell::after {
  z-index: 1;
  border-color: rgb(var(--v-theme-primary));
  transform: scale(0.82);
  transition:
    opacity 160ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.notif-center__bell:focus-visible::after {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .notif-center__bell,
  .notif-center__bell::after {
    transition: none;
  }
}

.notif-center__bell-wrap {
  position: relative;
  display: inline-flex;
}

.notif-center__bell-icon {
  width: 24px;
  height: 24px;
}

/* The unread count: a small pill on the bell's corner, "9+" past nine. */
.notif-center__badge {
  position: absolute;
  z-index: 2;
  top: -6px;
  left: 12px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: rgb(var(--v-theme-error));
  color: rgb(var(--v-theme-on-error));
  border: 2px solid var(--pwa-bg, #fff);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ── Card header: title + summary, the bell tile where the app bar bell lands ── */
.notif-center__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: var(--glass-popover-anchor-top, 16px) var(--glass-popover-anchor-end, 16px) 8px 20px;
}

.notif-center__heading {
  min-width: 0;
  padding-top: 2px;
}

.notif-center__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  line-height: 1.3;
  color: rgb(var(--v-theme-on-surface));
}

.notif-center__summary {
  margin: 2px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.notif-center__anchor {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 14%, transparent);
  color: rgb(var(--v-theme-primary));
}

.notif-center__anchor :deep(.app-icon) {
  width: 22px;
  height: 22px;
}

/* ── Toolbar: All / Unread and mark all read ── */
.notif-center__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 16px 8px 20px;
}

.notif-center__toggle {
  display: flex;
  width: max-content;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.notif-center__toggle-btn {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.65);
}

.notif-center__toggle-btn--active {
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}

.notif-center__mark-all {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgb(var(--v-theme-primary));
  white-space: nowrap;
}

/* ── The list: scrolls inside the card, capped on desktop ── */
.notif-center__list {
  max-height: 480px;
  padding: 0 8px 8px;
}

.notif-center__state {
  margin: 0;
  padding: 32px 16px;
  text-align: center;
  font-size: 0.875rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.notif-center__group + .notif-center__group {
  margin-top: 4px;
}

.notif-center__group-title {
  margin: 0;
  padding: 8px 12px 4px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.notif-center__group-title--action {
  color: rgb(var(--v-theme-warning));
}

.notif-center__items {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* ── One row: icon tile, title + context, time + unread dot ── */
.notif-row {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
}

.notif-row__reveal {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  padding-right: 20px;
  border-radius: inherit;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-size: 0.8125rem;
  font-weight: 600;
}

.notif-row__reveal :deep(.app-icon) {
  width: 18px;
  height: 18px;
}

/* The row sits on the glass itself; only while a finger drags it does it
   take a solid face, so the "Read" strip behind it doesn't show through. */
.notif-row__swipe {
  position: relative;
  border-radius: inherit;
  transition: transform 260ms var(--menu-spring, cubic-bezier(0.34, 1.3, 0.64, 1));
  touch-action: pan-y;
}

.notif-row__swipe--dragging {
  background: var(--glass-solid, rgb(var(--v-theme-surface)));
  transition: none;
}

.notif-row__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}

.notif-row__main:hover,
.notif-row__main:focus-visible {
  background: rgba(var(--v-theme-on-surface), 0.05);
  outline: none;
}

.notif-row__icon {
  --_tone: var(--v-theme-on-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: rgba(var(--_tone), 0.13);
  color: rgb(var(--_tone));
}

.notif-row__icon :deep(.app-icon) {
  width: 20px;
  height: 20px;
}

.notif-row__icon--appointment { --_tone: var(--v-theme-primary); }
.notif-row__icon--order { --_tone: var(--v-theme-info); }
.notif-row__icon--form { --_tone: var(--v-theme-secondary); }
.notif-row__icon--person { --_tone: var(--v-theme-success); }
.notif-row__icon--attention { --_tone: var(--v-theme-warning); }

.notif-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.notif-row__title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.35;
  color: rgb(var(--v-theme-on-surface));
}

.notif-row--unread .notif-row__title {
  font-weight: 650;
}

.notif-row__context {
  font-size: 0.8125rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.62);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.notif-row__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex: none;
  padding-top: 2px;
}

.notif-row__time {
  font-size: 0.75rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.notif-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
}

/* ── Quick actions (Needs action only, CORE-4 D2) ── */
.notif-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 12px 12px 60px;
}

.notif-row__action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.notif-row__action :deep(.app-icon) {
  width: 16px;
  height: 16px;
}

.notif-row__action--primary {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

/* Phone: the card spans the screen; the list takes what the screen leaves. */
@media (max-width: 767px) {
  .notif-center__list {
    max-height: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .notif-row__swipe {
    transition: none;
  }
}
</style>
