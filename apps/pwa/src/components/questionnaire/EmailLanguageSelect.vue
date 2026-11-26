<template>
  <VSelect
    :model-value="modelValue"
    :items="items"
    item-title="title"
    item-value="value"
    :label="t('app.clinical.email.language')"
    variant="outlined"
    density="compact"
    hide-details
    data-testid="email-language"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { LANGUAGE_OPTIONS } from "../../config/forms/localeFields";

/**
 * CORE-268: the sender sees and can change the language of the mail they are
 * about to send. The parent preselects the recipient's own language
 * (identities.language); the choice applies to this one send only.
 */
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [language: string] }>();
const { t } = useI18n();
const items = computed(() => LANGUAGE_OPTIONS.map((option) => ({ title: t(option.title), value: option.value })));
</script>
