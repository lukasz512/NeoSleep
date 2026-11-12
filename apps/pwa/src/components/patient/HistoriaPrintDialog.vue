<template>
  <AppFormDialog
    :model-value="modelValue"
    :max-width="560"
    :title="t('app.clinical.printPicker.title')"
    @update:model-value="emit('update:modelValue', $event)"
    @close="emit('update:modelValue', false)"
  >
    <ul class="print-picker__list">
      <li class="print-picker__row print-picker__row--fixed">
        <AppIcon name="form-history" />
        <div>
          <div class="text-body-large">{{ t("app.clinical.printPicker.historia") }}</div>
          <div class="text-body-small text-medium-emphasis">{{ t("app.clinical.printPicker.historiaHint") }}</div>
        </div>
      </li>
      <li class="print-picker__row" data-testid="print-consent">
        <VCheckbox v-model="consent" hide-details density="compact" :aria-label="t('app.clinical.printPicker.consent')" />
        <div>
          <div class="text-body-large">{{ t("app.clinical.printPicker.consent") }}</div>
          <div class="text-body-small text-medium-emphasis">
            {{ consentSignedOn ? t("app.clinical.printPicker.consentSigned", { date: consentSignedOn }) : t("app.clinical.printPicker.consentUnsigned") }}
          </div>
        </div>
      </li>
    </ul>

    <template v-if="canSign">
      <p class="print-picker__hint text-body-medium text-medium-emphasis">{{ t("app.clinical.doctorSignature.hint") }}</p>
      <ConsentSignatureField v-if="modelValue" ref="fieldRef" data-testid="doctor-signature-field" @change="empty = $event" />
    </template>

    <template #actions>
      <template v-if="canSign">
        <AppButton variant="text" data-testid="doctor-signature-skip" @click="print(null)">{{ t("app.clinical.doctorSignature.printUnsigned") }}</AppButton>
        <AppButton color="primary" :disabled="empty" data-testid="doctor-signature-sign" @click="sign">{{ t("app.clinical.doctorSignature.signAndPrint") }}</AppButton>
      </template>
      <AppButton v-else color="primary" data-testid="print-go" @click="print(null)">{{ t("app.clinical.printPicker.print") }}</AppButton>
    </template>
  </AppFormDialog>
</template>

<script lang="ts">
/** What the dialog picked: the consent page in or out, and the doctor's drawn signature (null: unsigned). */
export interface HistoriaPrintSelection {
  consent: boolean;
  signature: string | null;
}
</script>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppFormDialog from "../AppFormDialog.vue";
import AppIcon from "../AppIcon.vue";
import ConsentSignatureField from "../questionnaire/ConsentSignatureField.vue";

/**
 * NEO-260 D6/D7: before the Historia clínica PDF is generated, every role picks
 * what goes in it. The Consentimiento informado exists once: unsigned, it is
 * picked by default (to sign on paper); signed, it is left out by default and,
 * when picked, prints marked as a copy (the original stays in the patient's
 * documents). A doctor also signs here (NEO-255 D1, the pad moved from
 * DoctorSignatureDialog, which keeps the email flow). `print` fires inside the
 * click, so the caller can still open the PDF tab without a popup blocker.
 */

const props = defineProps<{ modelValue: boolean; canSign: boolean; consentSignedOn: string | null }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; print: [selection: HistoriaPrintSelection] }>();

const { t } = useI18n();
const fieldRef = ref<InstanceType<typeof ConsentSignatureField> | null>(null);
const empty = ref(true);
const consent = ref(!props.consentSignedOn);

// Every opening starts from the defaults and an empty pad (the field is re-created by v-if).
watch(
  () => [props.modelValue, props.consentSignedOn] as const,
  () => {
    empty.value = true;
    consent.value = !props.consentSignedOn;
  }
);

function print(signature: string | null) {
  emit("print", { consent: consent.value, signature });
}

function sign() {
  const field = fieldRef.value;
  if (!field || field.isEmpty()) return;
  print(field.toDataURL());
}
</script>

<style scoped>
.print-picker__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: grid;
  gap: 8px;
}
.print-picker__row {
  display: grid;
  grid-template-columns: 40px 1fr;
  align-items: center;
  gap: 8px;
}
.print-picker__row--fixed :deep(.app-icon),
.print-picker__row--fixed > :first-child {
  justify-self: center;
}
.print-picker__hint {
  margin: 12px 0;
}
</style>
