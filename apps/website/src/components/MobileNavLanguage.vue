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
        <span class="nav-lang__badge">{{ currentOption?.id.toUpperCase() }}</span>
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
          <span class="nav-lang__badge">{{ opt.id.toUpperCase() }}</span>
          <span>{{ opt.nativeLabel }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLanguageSelect } from "../composables/useLanguageSelect";

const { t } = useI18n();
const { locale, wrapRef, open, options, currentOption, select } = useLanguageSelect();
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

.nav-lang__badge {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1;
}

.nav-lang__label {
  @include nav.label;
}

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
