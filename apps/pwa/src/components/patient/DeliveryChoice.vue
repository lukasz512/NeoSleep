<template>
  <div class="delivery-choice" data-testid="delivery-choice">
    <VRadioGroup
      :model-value="mode"
      :label="t('app.deviceOrder.delivery.mode.label')"
      color="primary"
      hide-details
      density="compact"
      inline
      @update:model-value="(v) => emit('update:mode', v === 'custom' ? 'custom' : 'clinic')"
    >
      <VRadio value="clinic" :label="t('app.deviceOrder.delivery.mode.clinic')" />
      <VRadio value="custom" :label="t('app.deviceOrder.delivery.mode.custom')" />
    </VRadioGroup>

    <div v-if="mode === 'custom'" class="delivery-choice__form" data-testid="custom-delivery">
      <p class="delivery-choice__title">{{ t("app.deviceOrder.delivery.customTitle") }}</p>
      <div v-for="f in FIELDS" :key="f" :data-field="`delivery.${f}`" class="delivery-choice__field">
        <VTextField
          :model-value="address[f]"
          :label="labelOf(f)"
          :hint="f === 'name' ? t('app.deviceOrder.delivery.nameHint') : undefined"
          :persistent-hint="f === 'name'"
          :error-messages="errorFor(`delivery.${f}`)"
          :type="f === 'email' ? 'email' : f === 'phone' ? 'tel' : 'text'"
          variant="outlined"
          density="comfortable"
          @update:model-value="(v) => emit('update:field', f, String(v ?? ''))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { CustomDelivery } from "../../composables/useOrthoApneaOrderWizard";

/**
 * NEO-265: ship the device to the clinic (default) or to an address typed in,
 * as OrthoApnea's own order form does. The form only edits the shared state;
 * validation and the request body live in the wizard composable.
 */
defineProps<{
  mode: "clinic" | "custom";
  address: CustomDelivery;
  /** The message under a field, by its issue path (`delivery.<field>`). */
  errorFor: (path: string) => string | undefined;
}>();
const emit = defineEmits<{
  "update:mode": [mode: "clinic" | "custom"];
  "update:field": [field: keyof CustomDelivery, value: string];
}>();

const { t } = useI18n();

const FIELDS = ["name", "address", "city", "postalCode", "countryCode", "province", "phone", "email"] as const;

/** The existing field keys are lowercase fragments for sentences; a label starts with a capital. */
function labelOf(f: (typeof FIELDS)[number]): string {
  const text = t(`app.deviceOrder.delivery.field.${f}`);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
</script>

<style scoped>
.delivery-choice__form {
  margin-top: 12px;
}
.delivery-choice__title {
  margin: 0 0 8px;
  font-weight: 500;
}
.delivery-choice__field {
  margin-bottom: 4px;
}
</style>
