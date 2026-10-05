<template>
  <NumberStepperField
    class="advance-level-field"
    :model-value="value"
    :label="t('app.clinicalQueues.device.advanceLevel')"
    :min="1"
    :max="MAX_ADVANCE_LEVEL"
    :start="1"
    :disabled="saving"
    density="compact"
    hide-details
    data-testid="advance-level-field"
    @update:model-value="onInput"
  />
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDebounceFn } from "@vueuse/core";
import NumberStepperField from "../NumberStepperField.vue";
import { apiFetch } from "../../composables/useApi";
import { useNotifications } from "../../composables/useNotifications";

/**
 * The mandibular advance level the doctor authorizes at a control visit
 * (protocol visits 4–5, decision D4 2026-10-05): saved on its own endpoint
 * once the stepper settles, shown on the Tratamientos list.
 */
const MAX_ADVANCE_LEVEL = 10;
const SAVE_DELAY_MS = 600;

const props = defineProps<{ planId: string; level: number | null }>();
const emit = defineEmits<{ saved: [level: number | null] }>();
const { t } = useI18n();
const notifications = useNotifications();

const value = ref<number | null>(props.level);
const saving = ref(false);
watch(() => props.level, (l) => (value.value = l));

function parse(raw: unknown): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= MAX_ADVANCE_LEVEL ? n : NaN;
}

const save = useDebounceFn(async (level: number | null) => {
  if (level === props.level) return;
  saving.value = true;
  try {
    const res = await apiFetch(`/api/v1/treatment-plan/${props.planId}/advance-level`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advance_level: level }),
      errorMessageKey: "app.clinicalQueues.device.advanceError",
    });
    if (res.ok) {
      notifications.show(t("app.clinicalQueues.device.advanceSaved"), "success");
      emit("saved", level);
    } else {
      value.value = props.level;
    }
  } finally {
    saving.value = false;
  }
}, SAVE_DELAY_MS);

function onInput(raw: unknown) {
  const level = parse(raw);
  if (Number.isNaN(level)) return;
  value.value = level;
  void save(level);
}
</script>

<style scoped>
.advance-level-field {
  max-width: 220px;
}
</style>
