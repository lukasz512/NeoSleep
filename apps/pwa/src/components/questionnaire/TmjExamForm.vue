<template>
  <div class="tmj-form">
    <div class="tmj-form__main">
      <div class="tmj-form__head" aria-hidden="true">
        <span />
        <span>{{ t("app.clinical.tmj.right") }}</span>
        <span>{{ t("app.clinical.tmj.left") }}</span>
      </div>
      <div v-for="finding in TMJ_FINDINGS" :key="finding.key" class="tmj-form__row" role="group" :aria-labelledby="`tmj-${finding.key}`">
        <span :id="`tmj-${finding.key}`" class="tmj-form__label">{{ t(finding.labelKey) }}</span>
        <template v-for="side in TMJ_SIDES" :key="side">
          <span
            v-if="readonly"
            class="tmj-form__mark"
            :class="{ 'tmj-form__mark--on': modelValue[col(finding.key, side)] }"
            :data-finding="finding.key"
            :data-side="side"
          >
            {{ modelValue[col(finding.key, side)] ? "✓" : "—" }}
          </span>
          <VBtn
            v-else
            :data-finding="finding.key"
            :data-side="side"
            :aria-pressed="!!modelValue[col(finding.key, side)]"
            :aria-label="`${t(finding.labelKey)} · ${t(`app.clinical.tmj.${side}`)}`"
            :variant="modelValue[col(finding.key, side)] ? 'flat' : 'outlined'"
            :color="modelValue[col(finding.key, side)] ? 'primary' : undefined"
            size="small"
            class="tmj-form__side"
            @click="toggle(finding.key, side)"
          >
            <AppIcon v-if="modelValue[col(finding.key, side)]" name="check" class="tmj-form__check" />
            {{ t(`app.clinical.tmj.${side}Short`) }}
          </VBtn>
        </template>
      </div>

      <div class="tmj-form__row tmj-form__row--opening">
        <span id="tmj-opening" class="tmj-form__label">{{ t("app.clinical.tmj.maxOpening") }}</span>
        <strong v-if="readonly" class="tmj-form__opening-value">{{ opening ? t("app.clinical.tmj.mm", { mm: opening }) : "—" }}</strong>
        <VTextField
          v-else
          :model-value="opening"
          aria-labelledby="tmj-opening"
          :suffix="t('app.clinical.tmj.unitMm')"
          :error-messages="openingError"
          inputmode="numeric"
          variant="outlined"
          density="compact"
          :hide-details="!openingError"
          class="tmj-form__opening"
          @update:model-value="emit('update:opening', String($event ?? ''))"
        />
      </div>

      <p v-if="legacyFinding != null" class="tmj-form__legacy">
        {{ t("app.clinical.tmj.legacy", { answer: legacyFinding ? t("app.common.yes") : t("app.common.no") }) }}
      </p>
    </div>

    <aside class="tmj-form__side-panel">
      <TmjSkull :marked="tmjMarkedSides(modelValue)" />
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import TmjSkull from "./TmjSkull.vue";
import { TMJ_FINDINGS, TMJ_SIDES, parseTmjOpening, tmjMarkedSides, type TmjSide } from "../../config/questionnaires";

/**
 * "Evaluación del ATM" (NEO-231 D3, Dra. Lorena's mockup): five findings,
 * each ticked per side (Derecho / Izquierdo), the maximum opening in mm, and
 * a front-view skull that lights the joint of each side with a finding. An
 * unticked side means "not found", like the paper form. An older oral exam's
 * single ATM yes/no shows underneath, read-only.
 */
const props = defineProps<{
  modelValue: Record<string, boolean>;
  /** Maximum opening as typed (string), mm. */
  opening: string;
  readonly?: boolean;
  /** The latest oral exam's old has_tmj_finding, when it has one. */
  legacyFinding?: boolean | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: Record<string, boolean>];
  "update:opening": [value: string];
}>();
const { t } = useI18n();

const col = (finding: string, side: TmjSide) => `${finding}_${side}`;

function toggle(finding: string, side: TmjSide) {
  const key = col(finding, side);
  emit("update:modelValue", { ...props.modelValue, [key]: !props.modelValue[key] });
}

const openingError = computed(() => (parseTmjOpening(props.opening) === "invalid" ? t("app.clinical.tmj.openingRange") : ""));
</script>

<style scoped>
.tmj-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}
@media (min-width: 760px) {
  .tmj-form {
    grid-template-columns: minmax(0, 1fr) 200px;
    align-items: start;
  }
}
.tmj-form__side-panel {
  padding: 12px;
  border-radius: var(--pwa-radius, 12px);
  background: rgba(var(--v-theme-primary), 0.06);
}
.tmj-form__head,
.tmj-form__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 72px 72px;
  align-items: center;
  gap: 8px;
}
.tmj-form__head {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-primary));
  padding-bottom: 4px;
  text-align: center;
}
.tmj-form__row {
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}
.tmj-form__row--opening {
  grid-template-columns: minmax(0, 1fr) 152px;
}
.tmj-form__label {
  font-size: 0.875rem;
}
.tmj-form__side {
  min-width: 0;
  width: 100%;
  letter-spacing: 0.02em;
}
.tmj-form__check {
  width: 14px;
  height: 14px;
  margin-right: 2px;
}
.tmj-form__mark {
  text-align: center;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.4);
}
.tmj-form__mark--on {
  color: rgb(var(--v-theme-primary));
}
.tmj-form__opening-value {
  text-align: right;
}
.tmj-form__legacy {
  margin: 12px 0 0;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
