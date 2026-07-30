<template>
  <VMenu
    v-model="open"
    location="bottom end"
    :close-on-content-click="false"
    min-width="340"
    max-width="380"
  >
    <template #activator="{ props: menuProps }">
      <AppButton
        v-bind="menuProps"
        icon
        variant="text"
        class="notif-center__bell"
        :title="t('notificationCenter.bell.label')"
        :aria-label="unreadCount > 0
          ? t('notificationCenter.bell.labelWithCount', { count: unreadCount })
          : t('notificationCenter.bell.label')"
      >
        <span class="notif-center__bell-wrap">
          <AppIcon name="bell" class="notif-center__bell-icon" />
          <span v-if="unreadCount > 0" class="notif-center__dot" aria-hidden="true" />
        </span>
      </AppButton>
    </template>

    <div class="notif-center__panel" role="menu">
      <div class="notif-center__header">
        <div class="notif-center__toggle" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="filter === 'all'"
            :class="['notif-center__toggle-btn', { 'notif-center__toggle-btn--active': filter === 'all' }]"
            @click="setFilter('all')"
          >
            {{ t("notificationCenter.filter.all") }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="filter === 'unread'"
            :class="['notif-center__toggle-btn', { 'notif-center__toggle-btn--active': filter === 'unread' }]"
            @click="setFilter('unread')"
          >
            {{ t("notificationCenter.filter.unread") }}
          </button>
        </div>
        <button
          v-if="unreadCount > 0"
          type="button"
          class="notif-center__mark-all"
          @click="onMarkAllRead"
        >
          {{ t("notificationCenter.markAllRead") }}
        </button>
      </div>

      <div class="notif-center__list">
        <p v-if="loading" class="notif-center__state">{{ t("layout.loader.label") }}</p>
        <p v-else-if="loadError" class="notif-center__state">{{ t("notificationCenter.error.load") }}</p>
        <p v-else-if="items.length === 0" class="notif-center__state">
          {{ filter === "unread" ? t("notificationCenter.empty.unread") : t("notificationCenter.empty.all") }}
        </p>
        <ul v-else class="notif-center__items">
          <li
            v-for="item in items"
            :key="item.id"
            class="notif-center__item"
            :class="{ 'notif-center__item--unread': !item.readAt }"
          >
            <component
              :is="item.actionUrl ? 'RouterLink' : 'button'"
              v-bind="item.actionUrl ? { to: item.actionUrl } : { type: 'button' }"
              class="notif-center__item-link"
              @click="onItemClick(item)"
            >
              <span class="notif-center__item-body">
                <span class="notif-center__item-title">{{ item.title }}</span>
                <span v-if="item.body" class="notif-center__item-text">{{ item.body }}</span>
                <span class="notif-center__item-time">{{ formatTime(item.createdAt) }}</span>
              </span>
            </component>
          </li>
        </ul>
      </div>
    </div>
  </VMenu>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { VMenu } from "vuetify/components";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";
import { useNotificationCenter, type CenterNotification } from "../composables/useNotificationCenter";

const { t, locale } = useI18n();
// Polling lifecycle is owned by AppLayout.vue (always mounted for the whole
// session) — this component only renders on DashboardView now, but the
// unread count/dots must stay live everywhere else too.
const { items, unreadCount, loading, loadError, fetchList, markRead, markAllRead } = useNotificationCenter();

const open = ref(false);
const filter = ref<"all" | "unread">("all");

watch(open, (isOpen) => {
  if (isOpen) void fetchList(filter.value);
});

function setFilter(next: "all" | "unread") {
  filter.value = next;
  void fetchList(next);
}

function onItemClick(item: CenterNotification) {
  void markRead(item.id);
}

function onMarkAllRead() {
  void markAllRead();
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(locale.value, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
</script>

<style scoped>
.notif-center__bell-wrap {
  position: relative;
  display: inline-flex;
}

.notif-center__bell-icon {
  width: 24px;
  height: 24px;
}

.notif-center__dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pwa-error, #d32f2f);
  border: 1.5px solid var(--pwa-bg, #fff);
}

.notif-center__dot::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--pwa-error, #d32f2f);
  animation: notif-dot-pulse 1.8s ease-out infinite;
}

@keyframes notif-dot-pulse {
  0%   { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2.4); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .notif-center__dot::before {
    animation: none;
  }
}

.notif-center__panel {
  background: var(--pwa-bg, #fff);
  border: 1px solid var(--pwa-border, #e0e0e0);
  border-radius: var(--pwa-radius);
  overflow: hidden;
}

.notif-center__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pwa-border, #e0e0e0);
}

.notif-center__toggle {
  display: flex;
  gap: 2px;
  background: var(--pwa-surface-variant, rgba(0, 0, 0, 0.04));
  border-radius: var(--pwa-radius);
  padding: 2px;
}

.notif-center__toggle-btn {
  border: none;
  background: transparent;
  padding: 4px 10px;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: calc(var(--pwa-radius) - 2px);
  cursor: pointer;
  color: var(--pwa-text-secondary, #666);
}

.notif-center__toggle-btn--active {
  background: var(--pwa-bg, #fff);
  color: var(--pwa-text, #1a1a1a);
}

.notif-center__mark-all {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--pwa-primary, #128f83);
  white-space: nowrap;
}

.notif-center__list {
  max-height: 360px;
  overflow-y: auto;
}

.notif-center__state {
  margin: 0;
  padding: 24px 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--pwa-text-secondary, #666);
}

.notif-center__items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notif-center__item {
  border-bottom: 1px solid var(--pwa-border, #e0e0e0);
}

.notif-center__item:last-child {
  border-bottom: none;
}

.notif-center__item--unread {
  background: var(--pwa-primary-tint, rgba(18, 143, 131, 0.06));
}

.notif-center__item-link {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}

.notif-center__item-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.notif-center__item-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--pwa-text, #1a1a1a);
}

.notif-center__item-text {
  font-size: 0.8rem;
  color: var(--pwa-text-secondary, #666);
}

.notif-center__item-time {
  font-size: 0.7rem;
  color: var(--pwa-text-secondary, #666);
  margin-top: 2px;
}
</style>
