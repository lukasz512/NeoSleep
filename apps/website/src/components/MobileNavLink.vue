<template>
  <RouterLink :to="to" class="nav-link" :class="{ 'is-active': route.path === to }">
    <span class="nav-link__icon" aria-hidden="true"><slot /></span>
    <span class="nav-link__label">{{ t(labelKey) }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

defineProps<{ to: string; labelKey: string }>()

const { t } = useI18n()
const route = useRoute()
</script>

<style lang="scss" scoped>
@use '../assets/mobile-nav-item' as nav;

.nav-link { @include nav.item-base; }
.nav-link__icon { @include nav.icon; }
.nav-link__label { @include nav.label; }
</style>
