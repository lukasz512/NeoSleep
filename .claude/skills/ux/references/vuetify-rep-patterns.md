# Vuetify Patterns — Rep App

> Use Vuetify props, not custom CSS classes. `rounded="xl"` not `class="rounded-xl"`. `density="compact"` not padding hacks.

---

## App Shell

```vue
<VApp>
  <VNavigationDrawer />      <!-- tablet+, v-model for open state -->
  <VAppBar />
  <VMain>
    <VContainer fluid class="pa-4">
      <RouterView />
    </VContainer>
  </VMain>
  <VBottomNavigation />      <!-- mobile only: v-if="display.smAndDown" -->
</VApp>
```

---

## List View — search → skeleton → empty → list

```vue
<VContainer fluid class="pa-4">
  <VTextField
    v-model="search" prepend-inner-icon="mdi-magnify"
    :label="$t('common.search')" variant="outlined" density="compact"
    hide-details clearable rounded="xl" class="mb-4"
  />

  <template v-if="loading">
    <VSkeletonLoader v-for="i in 4" :key="i" type="list-item-avatar-two-line" class="mb-1" />
  </template>

  <VEmptyState
    v-else-if="!items.length" icon="mdi-account-search"
    :title="$t('hcp.empty.title')" :text="$t('hcp.empty.text')"
  />

  <VList v-else lines="two" bg-color="transparent">
    <VListItem
      v-for="item in items" :key="item.id"
      :title="item.name" :subtitle="item.specialty"
      :to="`/hcp/${item.id}`" rounded="xl" min-height="64"
    >
      <template #prepend>
        <VAvatar color="primary" size="44">{{ initials(item.name) }}</VAvatar>
      </template>
      <template #append>
        <VChip :color="statusColor(item.status)" size="x-small" variant="tonal">
          {{ $t(`visit.status.${item.status}`) }}
        </VChip>
      </template>
    </VListItem>
  </VList>
</VContainer>
```

---

## Detail View — back bar + identity card + tabs

```vue
<VContainer fluid class="pa-4">
  <VBtn variant="text" prepend-icon="mdi-arrow-left" @click="router.back()">
    {{ $t('common.back') }}
  </VBtn>

  <VCard rounded="xl" class="my-4">
    <VCardText class="d-flex align-center ga-4">
      <VAvatar color="primary" size="64">
        <span class="text-h5">{{ initials(hcp.name) }}</span>
      </VAvatar>
      <div>
        <div class="text-h6 font-weight-bold">{{ hcp.name }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ hcp.specialty }}</div>
      </div>
    </VCardText>
  </VCard>

  <VTabs v-model="tab" class="mb-4">
    <VTab value="overview">{{ $t('hcp.tabs.overview') }}</VTab>
    <VTab value="visits">{{ $t('hcp.tabs.visits') }}</VTab>
  </VTabs>
  <VWindow v-model="tab">
    <VWindowItem value="overview"><!-- ... --></VWindowItem>
    <VWindowItem value="visits"><!-- ... --></VWindowItem>
  </VWindow>
</VContainer>
```

---

## PCF Form — speed-optimized, one-hand use

```vue
<VCard rounded="xl">
  <VCardTitle class="pa-4">{{ $t('pcf.title') }}</VCardTitle>
  <VCardText class="pa-4">
    <VTextField v-model="date" type="date" :label="$t('pcf.date')" variant="outlined" :rules="[required]" class="mb-3" />

    <p class="text-caption mb-1">{{ $t('pcf.duration') }}</p>
    <VBtnToggle v-model="duration" mandatory rounded="xl" class="mb-4">
      <VBtn value="15">15 min</VBtn>
      <VBtn value="30">30 min</VBtn>
      <VBtn value="60">60 min</VBtn>
    </VBtnToggle>

    <VTextarea v-model="notes" :label="$t('pcf.notes')" variant="outlined" rows="3" auto-grow maxlength="500" counter />
  </VCardText>
  <VCardActions class="pa-4 pt-0">
    <VBtn variant="text" @click="$emit('cancel')">{{ $t('common.cancel') }}</VBtn>
    <VSpacer />
    <VBtn color="primary" :loading="saving" :disabled="!valid" prepend-icon="mdi-check" @click="submit">
      {{ $t('pcf.submit') }}
    </VBtn>
  </VCardActions>
</VCard>
```

---

## Feedback

```vue
<!-- Snackbar — action result -->
<VSnackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000" location="bottom">
  {{ snackbar.message }}
</VSnackbar>

<!-- Page-level loading -->
<VProgressLinear v-if="loading" indeterminate color="primary" />

<!-- Confirm delete -->
<VDialog v-model="confirmOpen" max-width="400">
  <VCard rounded="xl">
    <VCardTitle>{{ $t('common.confirm') }}</VCardTitle>
    <VCardText>{{ $t('hcp.deleteConfirm') }}</VCardText>
    <VCardActions>
      <VBtn variant="text" @click="confirmOpen = false">{{ $t('common.cancel') }}</VBtn>
      <VSpacer />
      <VBtn color="error" :loading="deleting" @click="doDelete">{{ $t('common.delete') }}</VBtn>
    </VCardActions>
  </VCard>
</VDialog>
```

---

## Status Chip Colors

```ts
const statusColor = (s: string) =>
  ({ visited: 'success', scheduled: 'info', missed: 'warning', new: 'default', cold: 'error' }[s] ?? 'default')
```

---

## Offline Banner

```vue
<!-- App.vue -->
<VBanner v-if="!isOnline" color="warning" icon="mdi-wifi-off" :text="$t('common.offline')" sticky />
```

```ts
const isOnline = ref(navigator.onLine)
window.addEventListener('online',  () => isOnline.value = true)
window.addEventListener('offline', () => isOnline.value = false)
```

---

## Typography & Spacing

| Role | Vuetify class |
|---|---|
| View title | `text-h5 font-weight-bold` |
| Card title | `text-h6 font-weight-bold` |
| Secondary | `text-body-2 text-medium-emphasis` |
| Caption | `text-caption text-medium-emphasis` |

Gaps: `ga-2` (Vuetify gap utility) not `gap-2`. Padding: `pa-4` card default, `pa-6` desktop.
Primary action buttons: `size="large"` (44px touch target).
