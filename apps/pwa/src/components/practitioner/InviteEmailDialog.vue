<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="440"
    :title="t('user.hcp.detail.inviteDialog.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <template #header-extra>
      <div class="invite-email__header-slot" data-testid="invite-email-header-slot">
        <EmailLanguageSelect v-model="mailLanguage" />
      </div>
    </template>

    <p class="invite-email__body" data-testid="invite-email-body">{{ t("user.hcp.detail.inviteDialog.body") }}</p>

    <template #actions>
      <VSpacer />
      <AppButton variant="text" @click="emit('update:modelValue', false)">{{ t("app.common.close") }}</AppButton>
      <AppButton color="primary" variant="flat" data-testid="invite-email-send" :loading="sending" @click="emit('send', mailLanguage)">
        {{ t("user.hcp.detail.inviteDialog.send") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppFormDialog from "../AppFormDialog.vue";
import AppButton from "../AppButton.vue";
import EmailLanguageSelect from "../questionnaire/EmailLanguageSelect.vue";

/**
 * NEO-272: sending (or resending) a doctor's invite. The mail language starts
 * at the doctor's own language and can be changed for this one send, same as
 * the patient's send-email dialog.
 */
const props = defineProps<{
  modelValue: boolean;
  /** The doctor's own language (practitioner.language); the picker starts here. */
  language: string;
  sending: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [open: boolean];
  send: [language: string];
}>();
const { t } = useI18n();

const mailLanguage = ref(props.language);
watch(
  () => [props.modelValue, props.language] as const,
  ([open]) => {
    if (open) mailLanguage.value = props.language;
  },
  { immediate: true }
);
</script>

<style scoped>
.invite-email__header-slot {
  padding: 4px 24px 0;
}
.invite-email__body {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.8);
}
</style>
