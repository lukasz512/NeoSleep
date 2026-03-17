<template>
  <div ref="wrapRef" class="nav-lang">
    <button
      type="button"
      class="nav-lang__btn"
      :aria-label="t('rep.settings.language')"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="open = !open"
    >
      <span class="nav-lang__icon" aria-hidden="true">
        <FlagIcon v-if="currentOption" :locale="currentOption.id" class="nav-lang__flag" />
      </span>
      <span class="nav-lang__label">{{ currentOption?.nativeLabel ?? 'Lang' }}</span>
    </button>

    <Transition name="nav-lang-up">
      <div v-show="open" class="nav-lang__dropdown" role="menu">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          role="menuitem"
          class="nav-lang__item"
          :class="{ 'nav-lang__item--active': locale === opt.id }"
          @click="select(opt.id)"
        >
          <FlagIcon :locale="opt.id" class="nav-lang__item-flag" />
          <span>{{ opt.nativeLabel }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useWebsiteLocale } from '../composables/useWebsiteLocale'
import { LANGUAGE_OPTIONS } from '@i18n/language-options'
import type { WebsiteLocale } from '../composables/useWebsiteLocale'
import FlagIcon from './FlagIcon.vue'

const { t } = useI18n()
const { locale, supported, setLocale } = useWebsiteLocale()

const wrapRef = ref<HTMLElement | null>(null)
const open = ref(false)

const options = computed(() =>
  LANGUAGE_OPTIONS.filter((o) => supported.includes(o.id as WebsiteLocale))
)

const currentOption = computed(() =>
  options.value.find((o) => o.id === locale.value)
)

function select(id: string) {
  if (supported.includes(id as WebsiteLocale)) {
    setLocale(id as WebsiteLocale)
    open.value = false
  }
}

function onDocClick(e: MouseEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style lang="scss" scoped>
@use '../assets/mobile-nav-item' as nav;

.nav-lang {
  flex: 1;
  position: relative;
  display: flex;
}

.nav-lang__btn {
  @include nav.item-base;
  width: 100%;
}

.nav-lang__icon {
  @include nav.icon;
}

.nav-lang__flag {
  width: 22px;
  height: 22px;
}

.nav-lang__flag :deep(.flag-icon) {
  width: 100%;
  height: 100%;
}

.nav-lang__label {
  @include nav.label;
}

// ── Dropdown (opens upward) ───────────────────────────────────────────────────
.nav-lang__dropdown {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 140px;
  padding: 0.4rem 0;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  box-shadow: var(--website-shadow-md);
  z-index: 10010;
}

.nav-lang__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  font-size: 0.9rem;
  color: var(--website-text);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;

  &:hover {
    background: rgba(18, 143, 131, 0.08);
  }

  &--active {
    font-weight: 600;
    color: var(--website-primary);
  }
}

.nav-lang__item-flag {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

// ── Transition ────────────────────────────────────────────────────────────────
.nav-lang-up-enter-active,
.nav-lang-up-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.nav-lang-up-enter-from,
.nav-lang-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
</style>
