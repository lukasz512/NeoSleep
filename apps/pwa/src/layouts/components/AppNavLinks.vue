<template>
  <nav class="layout-app__nav" aria-label="App sections">
    <VList class="layout-app__nav-list" density="compact" bg-color="transparent">
      <VTooltip
        v-for="item in visibleNavRoutes"
        :key="item.path"
        :text="t(navTitleKey(item.name))"
        location="end"
        :disabled="!collapsed"
      >
        <template #activator="{ props: tooltipProps }">
          <RouterLink v-slot="{ navigate, isActive }" :to="item.path" custom>
            <VListItem
              v-bind="collapsed ? tooltipProps : {}"
              :class="[
                'layout-app__nav-link',
                { 'layout-app__nav-link--active': isActive, 'router-link-active': isActive },
              ]"
              rounded="lg"
              @click="() => { navigate(); $emit('navigate'); }"
            >
              <template #prepend>
                <AppIcon :name="('nav-' + item.name) as AppIconName" class="layout-app__nav-icon" />
              </template>
              <span class="layout-app__nav-text" :aria-hidden="collapsed">
                {{ t(navTitleKey(item.name)) }}
              </span>
            </VListItem>
          </RouterLink>
        </template>
      </VTooltip>
    </VList>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { navTitleKey } from "../../router/routes";
import { useVisibleNavRoutes } from "../../composables/useVisibleNavRoutes";
import AppIcon, { type AppIconName } from "../../components/AppIcon.vue";

defineProps<{
  collapsed?: boolean;
}>();

defineEmits<{
  navigate: [];
}>();

const { t } = useI18n();
const { visibleNavRoutes } = useVisibleNavRoutes();
</script>

<style scoped>
.layout-app__nav-list {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
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
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Hide default VListItem text color so theme variables apply */
.layout-app__nav-link :deep(.v-list-item__content),
.layout-app__nav-link :deep(.v-list-item-title) {
  color: inherit;
  font-size: 0.875rem;
}
</style>
