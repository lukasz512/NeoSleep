<template>
  <nav v-if="variant === 'sidebar'" class="layout-app__nav" aria-label="App sections">
    <VList class="layout-app__nav-list" density="compact" bg-color="transparent">
      <VTooltip
        v-for="item in appNavRoutes"
        :key="item.path"
        :text="t(titleKey(item.name))"
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
              @click="() => navigate()"
            >
              <template #prepend>
                <AppNavIcon :name="item.name" />
              </template>
              <span class="layout-app__nav-text" :aria-hidden="collapsed">
                {{ t(titleKey(item.name)) }}
              </span>
            </VListItem>
          </RouterLink>
        </template>
      </VTooltip>
    </VList>
  </nav>
  <nav v-else class="layout-app__mobile-drawer-nav" aria-label="App sections">
    <VList density="compact" bg-color="transparent" class="layout-app__mobile-drawer-nav-list">
      <RouterLink
        v-for="item in appNavRoutes"
        :key="item.path"
        v-slot="{ navigate, isActive }"
        :to="item.path"
        custom
      >
        <VListItem
          :class="[
            'layout-app__mobile-drawer-link',
            { 'layout-app__mobile-drawer-link--active': isActive, 'router-link-active': isActive },
          ]"
          rounded="lg"
          @click="() => { navigate(); $emit('navigate'); }"
        >
          <template #prepend>
            <AppNavIcon :name="item.name" />
          </template>
          {{ t(titleKey(item.name)) }}
        </VListItem>
      </RouterLink>
    </VList>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { appNavRoutes } from "../../router/routes";
import AppNavIcon from "./AppNavIcon.vue";

defineProps<{
  variant: "sidebar" | "drawer";
  collapsed?: boolean;
}>();

defineEmits<{
  navigate: [];
}>();

const { t } = useI18n();

function titleKey(name: string): string {
  return `rep.${name}.title`;
}
</script>

<style lang="scss" scoped>
/* Override Vuetify list so our nav classes control look; keep nav-link semantics for AppSidebar styles */
.layout-app__nav-list,
.layout-app__mobile-drawer-nav-list {
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout-app__nav-list :deep(.v-list-item),
.layout-app__mobile-drawer-nav-list :deep(.v-list-item) {
  min-height: unset;
  padding: 8px 10px;
}

.layout-app__nav-list :deep(.v-list-item__prepend),
.layout-app__mobile-drawer-nav-list :deep(.v-list-item__prepend) {
  margin-inline-end: 10px;
  opacity: 1;
  min-width: 20px;
  flex-shrink: 0;
}


/* Ensure nav icons are visible (VListItem prepend can be hidden by density) */
.layout-app__nav-list :deep(.v-list-item__prepend .layout-app__nav-icon),
.layout-app__mobile-drawer-nav-list :deep(.v-list-item__prepend .layout-app__nav-icon) {
  display: flex !important;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Sidebar: hide default VListItem text color so theme variables apply */
.layout-app__nav-link :deep(.v-list-item__content),
.layout-app__nav-link :deep(.v-list-item-title) {
  color: inherit;
  font-size: 0.875rem;
}

.layout-app__mobile-drawer-link :deep(.v-list-item__content),
.layout-app__mobile-drawer-link :deep(.v-list-item-title) {
  color: inherit;
  font-size: 0.875rem;
}
</style>
