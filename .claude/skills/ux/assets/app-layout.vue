<!--
  TEMPLATE: App Layout — global shell for apps/client-pwa
  ────────────────────────────────────────────────────────
  This file is the root shell. All views render inside <RouterView />.
  Key patterns shown here:
    1. All global imports at the top of <script setup>
    2. Config-driven nav — never hardcode nav items in a component
    3. useDisplay() for responsive — no manual breakpoint media queries
    4. Symmetry: NavigationDrawer (tablet+) ↔ BottomNavigation (mobile)
    5. Theme toggle via store — single source of truth
-->
<template>
  <VApp :theme="theme">

    <!-- Sidebar — tablet and above -->
    <VNavigationDrawer v-model="drawer" :rail="rail" color="surface">
      <VList nav density="compact">
        <VListItem
          v-for="item in navItems" :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="t(item.labelKey)"
          active-color="primary"
        />
      </VList>
      <template #append>
        <VListItem
          prepend-icon="mdi-logout"
          :title="t('nav.logout')"
          @click="auth.logout()"
        />
      </template>
    </VNavigationDrawer>

    <!-- Top bar -->
    <VAppBar :elevation="0">
      <VAppBarNavIcon v-if="mobile" @click="drawer = !drawer" />
      <VBtn v-else icon @click="rail = !rail">
        <VIcon>{{ rail ? 'mdi-menu-open' : 'mdi-menu' }}</VIcon>
      </VBtn>

      <VToolbarTitle class="font-weight-bold">{{ config.appName }}</VToolbarTitle>

      <template #append>
        <VBtn icon :aria-label="t('nav.toggleTheme')" @click="themeStore.toggle()">
          <VIcon>{{ theme === 'dark' ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</VIcon>
        </VBtn>
        <VAvatar
          color="primary" size="36" class="cursor-pointer mr-2"
          role="button" :aria-label="t('nav.profile')"
          @click="profileOpen = true"
        >
          <span class="text-caption font-weight-bold">{{ initials(auth.user?.name) }}</span>
        </VAvatar>
      </template>
    </VAppBar>

    <!-- Page content -->
    <VMain>
      <RouterView />
    </VMain>

    <!-- Bottom nav — mobile only, max 4 items -->
    <VBottomNavigation v-if="mobile" v-model="activeRoute" color="primary" grow>
      <VBtn
        v-for="item in navItems.slice(0, 4)" :key="item.to"
        :value="item.to" :to="item.to"
        :aria-label="t(item.labelKey)"
      >
        <VIcon>{{ item.icon }}</VIcon>
        <span>{{ t(item.labelKey) }}</span>
      </VBtn>
    </VBottomNavigation>

    <!-- Global offline notice -->
    <VBanner
      v-if="!isOnline"
      color="warning"
      icon="mdi-wifi-off"
      :text="t('common.offline')"
      sticky
    />

  </VApp>
</template>

<script setup lang="ts">
// @ts-nocheck — template file, not compiled as part of the project
import { ref, computed }    from 'vue'
import { useRoute }         from 'vue-router'
import { useI18n }          from 'vue-i18n'
import { useDisplay }       from 'vuetify'
import { useAuthStore }     from '@neo/stores'
import { useThemeStore }    from '@neo/stores'
import { useAppConfig }     from '@/composables/useAppConfig'

const { t }        = useI18n()
const { mobile }   = useDisplay()
const route        = useRoute()
const auth         = useAuthStore()
const themeStore   = useThemeStore()
const config       = useAppConfig()

const drawer      = ref(!mobile.value)   // open by default on tablet+
const rail        = ref(false)           // icon-only collapsed sidebar
const profileOpen = ref(false)
const isOnline    = ref(navigator.onLine)

const theme       = computed(() => themeStore.current)
const activeRoute = computed(() => route.path)

// Nav driven by config — filtered by feature flags
// Items defined in app_config table, not hardcoded here
const navItems = computed(() =>
  config.navItems.filter(item => !item.feature || config.hasFeature(item.feature))
)

const initials = (name?: string) =>
  (name ?? '??').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

window.addEventListener('online',  () => isOnline.value = true)
window.addEventListener('offline', () => isOnline.value = false)
</script>
