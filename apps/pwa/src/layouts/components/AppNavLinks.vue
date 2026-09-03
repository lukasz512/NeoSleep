<template>
  <nav class="layout-app__nav" :class="{ 'layout-app__nav--expanded': !collapsed }" aria-label="App sections">
    <VList class="layout-app__nav-list" density="compact" bg-color="transparent" color="primary">
      <VTooltip
        v-for="item in visibleNavRoutes"
        :key="item.path"
        :text="t(navTitleKey(item.name))"
        location="end"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tooltipProps }">
          <VListItem
            v-bind="collapsed ? tooltipProps : {}"
            :to="item.path"
            class="layout-app__nav-link"
            rounded="lg"
            @click="$emit('navigate')"
          >
            <template #prepend>
              <span class="layout-app__nav-icon-wrap">
                <AppIcon :name="('nav-' + item.name) as AppIconName" class="layout-app__nav-icon" />
                <span
                  v-if="item.name === 'dashboard' && unreadCount > 0"
                  class="layout-app__nav-dot"
                  aria-hidden="true"
                />
              </span>
            </template>
            <span class="layout-app__nav-text" :aria-hidden="collapsed">
              {{ t(navTitleKey(item.name)) }}
            </span>
          </VListItem>
        </template>
      </VTooltip>
    </VList>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { navTitleKey } from "../../router/routes";
import { useVisibleNavRoutes } from "../../composables/useVisibleNavRoutes";
import { useNotificationCenter } from "../../composables/useNotificationCenter";
import AppIcon, { type AppIconName } from "../../components/AppIcon.vue";

defineProps<{
  collapsed?: boolean;
}>();

defineEmits<{
  navigate: [];
}>();

const { t } = useI18n();
const { visibleNavRoutes } = useVisibleNavRoutes();
const { unreadCount } = useNotificationCenter();
</script>

<style scoped>
.layout-app__nav-list {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Rail (collapsed) mode is width-constrained (56px), so it keeps the tight
   default spacing — this extra breathing room only applies when the sidebar
   is fully expanded. */
.layout-app__nav--expanded {
  padding: 12px 8px 0;
}

.layout-app__nav-list :deep(.v-list-item) {
  min-height: unset;
  padding: 8px 10px;
}

.layout-app__nav-list :deep(.v-list-item__prepend) {
  margin-inline-end: 10px;
  opacity: 1;
  min-width: 20px;
  flex-shrink: 0;
}

/* Ensure nav icons are visible (VListItem prepend can be hidden by density) */
.layout-app__nav-list :deep(.v-list-item__prepend .layout-app__nav-icon) {
  display: flex !important;
  flex-shrink: 0;
}

.layout-app__nav-icon-wrap {
  position: relative;
  display: inline-flex;
}

.layout-app__nav-dot {
  position: absolute;
  top: -2px;
  left: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pwa-error, #d32f2f);
  border: 1.5px solid rgb(var(--v-theme-surface-container-low));
}

.layout-app__nav-dot::before {
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
  .layout-app__nav-dot::before {
    animation: none;
  }
}

.layout-app__nav-link :deep(.v-list-item-title) {
  font-size: 0.875rem;
}
</style>
