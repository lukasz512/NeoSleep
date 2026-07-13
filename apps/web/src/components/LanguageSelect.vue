<template>
  <div ref="wrapRef" class="lang-select">
    <NavTooltip :text="t('user.settings.language')">
      <button
        type="button"
        class="lang-select__trigger"
        :aria-label="t('user.settings.language')"
        :aria-expanded="open"
        aria-haspopup="true"
        @click="open = !open"
      >
        <span class="lang-select__badge">{{ currentOption?.id.toUpperCase() }}</span>
      </button>
    </NavTooltip>
    <Transition name="lang-drop">
      <div v-show="open" class="lang-select__dropdown" role="menu">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          role="menuitem"
          class="lang-select__item"
          :class="{ 'lang-select__item--active': locale === opt.id }"
          @click="select(opt.id)"
        >
          <span class="lang-select__badge">{{ opt.id.toUpperCase() }}</span>
          <span class="lang-select__item-name">{{ opt.nativeLabel }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useLanguageSelect } from "../composables/useLanguageSelect";
import NavTooltip from "./NavTooltip.vue";

const { t } = useI18n();
const { locale, wrapRef, open, options, currentOption, select } = useLanguageSelect();
</script>

<style lang="scss" scoped>
.lang-select {
  position: relative;
}

.lang-select__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: var(--website-radius);
  background: var(--website-bg);
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: rgba(18, 143, 131, 0.06);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

.lang-select__badge {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--website-text-muted);
  line-height: 1;
}

.lang-select__dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 160px;
  padding: 0.5rem 0;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  box-shadow: var(--website-shadow-md);
  z-index: 100;
}

.lang-select__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 1rem;
  border: none;
  background: none;
  font-size: 0.9375rem;
  color: var(--website-text);
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;

  &:hover {
    background: rgba(18, 143, 131, 0.08);
  }

  &--active {
    font-weight: 600;
    color: var(--website-primary);
  }
}

.lang-drop-enter-active,
.lang-drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.lang-drop-enter-from,
.lang-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
