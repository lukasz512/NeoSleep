<template>
  <div ref="wrapRef" class="lang-select">
    <button
      type="button"
      class="lang-select__trigger"
      :aria-label="currentLabel"
      :aria-expanded="open"
      aria-haspopup="true"
      @click="toggle"
    >
      <span class="lang-select__flag" aria-hidden="true">{{ currentOption?.flag }}</span>
    </button>
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
          <span class="lang-select__item-flag" aria-hidden="true">{{ opt.flag }}</span>
          <span class="lang-select__item-name">{{ t(opt.labelKey) }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { useWebsiteLocale } from "../composables/useWebsiteLocale";
import type { WebsiteLocale } from "../composables/useWebsiteLocale";
import { LANGUAGE_OPTIONS, type LocaleId } from "@i18n/language-options";

const { t } = useI18n();
const { locale, supported, setLocale } = useWebsiteLocale();

const wrapRef = ref<HTMLElement | null>(null);
const open = ref(false);

const options = computed(() =>
  LANGUAGE_OPTIONS.filter((o) => supported.includes(o.id as WebsiteLocale))
);

const currentOption = computed(() => options.value.find((o) => o.id === locale.value));

const currentLabel = computed(() =>
  currentOption.value ? t(currentOption.value.labelKey) : "Language"
);

function toggle() {
  open.value = !open.value;
}

function select(id: LocaleId) {
  if (supported.includes(id as WebsiteLocale)) {
    setLocale(id as WebsiteLocale);
    open.value = false;
  }
}

function onDocumentClick(e: MouseEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
});
</script>

<style lang="scss" scoped>
.lang-select {
  position: relative;
}

.lang-select__trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  min-width: 40px;
  min-height: 40px;
  padding: 0;
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  background: var(--website-bg);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: var(--website-primary);
    background: rgba(18, 143, 131, 0.06);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

.lang-select__flag {
  display: block;
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

.lang-select__item-flag {
  font-size: 1.125rem;
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
