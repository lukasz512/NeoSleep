<!--
  TEMPLATE: Entity List View — HCPView, HCOView, LeadsView, PatientsView
  ────────────────────────────────────────────────────────────────────────
  Key patterns shown here:
    1. AppEntityList owns ALL shared chrome: toolbar, search, chip filters,
       loading skeletons, error alert, empty state — never repeat these per view
    2. View defines only: endpoint, i18n-ns, add-route, filter-options, item slot
    3. Filter options come from config.lookups() — tenant-overridable, no hardcoding
    4. Item slot: entity-specific display only (avatar, name, status chip)
    5. All helpers are pure functions — no state, no imports beyond config
-->
<template>
  <AppEntityList
    endpoint="/TODO"
    i18n-ns="user.TODO"
    add-route="/TODO/new"
    :filter-options="filterOptions"
  >
    <template #item="{ item }">
      <VListItem
        :to="`/TODO/${item.id}`"
        :title="displayName(item)"
        :subtitle="item.subtitle"
        rounded="xl" min-height="64"
      >
        <template #prepend>
          <VAvatar color="primary" size="44">
            <span class="text-body-2 font-weight-bold text-white">{{ initials(item) }}</span>
          </VAvatar>
        </template>
        <template #append>
          <VChip :color="statusColor(item.status)" size="x-small" variant="tonal">
            {{ $t(`user.TODO.status.${item.status}`) }}
          </VChip>
        </template>
      </VListItem>
    </template>
  </AppEntityList>
</template>

<script setup lang="ts">
// @ts-nocheck — template file, not compiled as part of the project
import { useI18n }      from 'vue-i18n'
import { useAppConfig } from '@/composables/useAppConfig'
import AppEntityList    from '@/components/AppEntityList.vue'

const { t }  = useI18n()
const config = useAppConfig()

// Filter chips sourced from lookups — tenant can add/override from admin panel
// platform.lookups provides defaults; {tenant}.lookup overrides them
const filterOptions = config.lookups('TODO_status')

// Entity-specific display helpers — only what's unique to this entity
const displayName = (item: TODO) =>
  [item.prefix, item.firstName, item.lastName].filter(Boolean).join(' ')

const initials = (item: TODO) =>
  `${item.firstName[0]}${item.lastName[0]}`.toUpperCase()

const statusColor = (s: string): string =>
  ({ new: 'info', scheduled: 'primary', visited: 'success', cold: 'default', missed: 'error' }[s] ?? 'default')
</script>
