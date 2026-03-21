<template>
  <RouterLink :to="to" class="nav-link" :class="{ 'is-active': isActive }" @click.prevent="onClick">
    <span class="nav-link__icon" aria-hidden="true"><slot /></span>
    <span class="nav-link__label">{{ t(labelKey) }}</span>
  </RouterLink>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { smoothScrollToTop } from '@neo/shared/composables/useSmoothScrollAnchors'

const props = defineProps<{ to: string; labelKey: string }>()

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const isActive = computed(() => route.path === props.to)

function onClick() {
  if (isActive.value) {
    smoothScrollToTop()
  } else {
    router.push(props.to)
  }
}
</script>

<style lang="scss" scoped>
@use '../assets/mobile-nav-item' as nav;

.nav-link { @include nav.item-base; }
.nav-link__icon { @include nav.icon; }
.nav-link__label { @include nav.label; }
</style>
