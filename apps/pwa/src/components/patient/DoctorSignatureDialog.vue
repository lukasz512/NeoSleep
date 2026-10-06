<template>
  <AppFormDialog
    :model-value="modelValue"
    :max-width="760"
    :title="t('app.clinical.doctorSignature.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <p class="doctor-signature__hint text-body-medium text-medium-emphasis">{{ t("app.clinical.doctorSignature.hint") }}</p>
    <ConsentSignatureField
      v-if="modelValue"
      ref="fieldRef"
      data-testid="doctor-signature-field"
      :phone-start="phoneStart"
      @change="empty = $event"
    />
    <template #actions>
      <AppButton variant="text" data-testid="doctor-signature-skip" @click="emit('print', null)">
        {{ t("app.clinical.doctorSignature.printUnsigned") }}
      </AppButton>
      <AppButton color="primary" :disabled="empty" data-testid="doctor-signature-sign" @click="sign">
        {{ t("app.clinical.doctorSignature.signAndPrint") }}
      </AppButton>
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppFormDialog from "../AppFormDialog.vue";
import ConsentSignatureField from "../questionnaire/ConsentSignatureField.vue";
import { doctorHandoffStart } from "../../composables/signatureHandoffStart";

/**
 * NEO-255 D1: before a doctor prints a patient's Historia clínica, they sign
 * it here. The drawn signature goes with that one print (the "Firma del
 * doctor" panel on page 2, with a dated stamp; the consent page stays the
 * patient's) and is never stored; "Print unsigned"
 * keeps the blank line to sign on paper. `print` fires inside the click, so
 * the caller can still open the PDF tab without a popup blocker.
 */

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; print: [signature: string | null] }>();

const { t } = useI18n();
const fieldRef = ref<InstanceType<typeof ConsentSignatureField> | null>(null);
const empty = ref(true);
/** CORE-172: a QR next to the pad on a computer — the phone signature comes back here, and the doctor still clicks Sign and print. */
const phoneStart = doctorHandoffStart();

// Every opening starts from an empty pad (the field is re-created by v-if).
watch(
  () => props.modelValue,
  () => (empty.value = true)
);

function sign() {
  const field = fieldRef.value;
  if (!field || field.isEmpty()) return;
  emit("print", field.toDataURL());
}
</script>

<style scoped>
.doctor-signature__hint {
  margin: 0 0 12px;
}
</style>
