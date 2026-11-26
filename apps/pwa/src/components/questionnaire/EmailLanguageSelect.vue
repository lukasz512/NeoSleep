<template>
  <VMenu location="bottom end">
    <template #activator="{ props: menuProps }">
      <VBtn
        v-bind="menuProps"
        class="email-language"
        variant="tonal"
        density="comfortable"
        rounded="pill"
        :aria-label="label"
        :title="label"
        data-testid="email-language"
      >
        <span class="email-language__flag" aria-hidden="true">{{ flagOf(modelValue) }}</span>
        <span class="email-language__code" aria-hidden="true">{{ modelValue === "mx" ? "ES" : modelValue.toUpperCase() }}</span>
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
      </VListItem>
    </VList>
  </VMenu>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
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
const label = computed(() => {
  const current = items.value.find((option) => option.value === props.modelValue);
  return t("app.clinical.email.languageFlagLabel", { language: current?.title ?? props.modelValue });
});
</script>

<style scoped>
.email-language {
  letter-spacing: 0;
  min-width: 0;
  gap: 6px;
}
.email-language__flag {
  font-size: 1.125rem;
  line-height: 1;
}
.email-language__code {
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
