<template>
  <div class="email-language-field">
    <span class="email-language-field__label" aria-hidden="true">{{ t("app.clinical.email.language") }}</span>
    <VMenu location="bottom end">
      <template #activator="{ props: menuProps }">
        <VBtn
          v-bind="menuProps"
          class="email-language"
          variant="outlined"
          rounded="pill"
          :aria-label="label"
          :title="label"
          data-testid="email-language"
        >
          <span class="email-language__flag" aria-hidden="true">{{ flagOf(modelValue) }}</span>
          <span class="email-language__name" aria-hidden="true">{{ currentTitle }}</span>
          <AppIcon name="chevron-down" class="email-language__chevron" aria-hidden="true" />
        </VBtn>
      </template>
      <VList density="compact" :aria-label="t('app.clinical.email.language')">
        <VListItem
          v-for="option in items"
          :key="option.value"
          :active="option.value === modelValue"
          :data-testid="`email-language-${option.value}`"
          @click="emit('update:modelValue', option.value)"
        >
          <template #prepend><span class="email-language__flag" aria-hidden="true">{{ flagOf(option.value) }}</span></template>
          <VListItemTitle>{{ option.title }}</VListItemTitle>
          <template v-if="option.value === modelValue" #append><AppIcon name="check" aria-hidden="true" /></template>
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import { LANGUAGE_OPTIONS } from "../../config/forms/localeFields";

/**
 * CORE-268 / NEO-272: the sender sees and can change the language of the mail
 * they are about to send, as a compact flag control. The parent preselects the
 * recipient's own language (identities.language); the choice applies to this
 * one send only. The flag is decoration: the accessible name is the language.
 */
const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [language: string] }>();
const { t } = useI18n();
const items = computed(() => LANGUAGE_OPTIONS.map((option) => ({ title: t(option.title), value: option.value })));

const FLAGS: Record<string, string> = { en: "🇬🇧", pl: "🇵🇱", mx: "🇲🇽" };
function flagOf(language: string): string {
  return FLAGS[language] ?? "🌐";
}
const currentTitle = computed(() => items.value.find((option) => option.value === props.modelValue)?.title ?? props.modelValue);
const label = computed(() => {
  const current = items.value.find((option) => option.value === props.modelValue);
  return t("app.clinical.email.languageFlagLabel", { language: current?.title ?? props.modelValue });
});
</script>

<style scoped>
.email-language-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.email-language-field__label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.email-language {
  letter-spacing: 0;
  text-transform: none;
  min-width: 44px;
  min-height: 44px;
  gap: 8px;
  padding-inline: 14px;
}
.email-language__flag {
  font-size: 1.25rem;
  line-height: 1;
}
.email-language__name {
  font-size: 0.875rem;
  font-weight: 500;
}
.email-language__chevron {
  opacity: 0.7;
}
</style>
