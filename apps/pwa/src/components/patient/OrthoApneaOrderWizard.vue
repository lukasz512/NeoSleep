<template>
  <VDialog :model-value="modelValue" max-width="880" :transition="originDialogTransition" persistent @update:model-value="onDialogUpdate">
    <VCard class="oa-wizard__card">
      <VCardTitle class="oa-wizard__title-row">
        <span>{{ t("app.orthoApneaOrder.title") }}</span>
        <VSpacer />
        <AppButton icon variant="text" :aria-label="t('app.common.close')" @click="onCancelClick">
          <AppIcon name="close" />
        </AppButton>
      </VCardTitle>

      <VStepper v-model="step" flat class="oa-wizard__stepper" hide-actions>
        <VStepperHeader>
          <VStepperItem
            color="primary"
            :title="t('app.orthoApneaOrder.step1.title')"
            :value="1"
            :complete="step > 1"
            :class="{ 'oa-wizard__step--clickable': maxReachedStep >= 1 }"
            @click="goToStep(1)"
          />
          <VDivider />
          <VStepperItem
            color="primary"
            :title="t('app.orthoApneaOrder.step2.title')"
            :value="2"
            :complete="step > 2"
            :class="{ 'oa-wizard__step--clickable': maxReachedStep >= 2 }"
            @click="goToStep(2)"
          />
          <VDivider />
          <VStepperItem
            color="primary"
            :title="t('app.orthoApneaOrder.step3.title')"
            :value="3"
            :complete="step > 3"
            :class="{ 'oa-wizard__step--clickable': maxReachedStep >= 3 }"
            @click="goToStep(3)"
          />
          <VDivider />
          <VStepperItem
            color="primary"
            :title="t('app.orthoApneaOrder.review.title')"
            :value="4"
            :class="{ 'oa-wizard__step--clickable': maxReachedStep >= 4 }"
            @click="goToStep(4)"
          />
        </VStepperHeader>
      </VStepper>

      <VCardText class="oa-wizard__body">
      <Transition :name="stepTransitionName" mode="out-in">
      <div :key="step">
        <!-- Step 1 — Envío -->
        <div v-if="step === 1">
          <VAutocomplete
            v-model="form.doctorId"
            :items="doctorOptions"
            item-title="title"
            item-value="value"
            :label="t('app.orthoApneaOrder.form.doctor')"
            :loading="loadingDoctors"
            variant="outlined"
            density="comfortable"
          />
          <VRadioGroup v-model="form.addressSend" color="primary" :label="t('app.orthoApneaOrder.form.addressSend')" inline>
            <VRadio value="clinic" :label="t('app.orthoApneaOrder.form.addressSendClinic')" />
            <VRadio value="alternative" :label="t('app.orthoApneaOrder.form.addressSendAlternative')" />
          </VRadioGroup>

          <VRow v-if="form.addressSend === 'alternative'" class="mt-2">
            <VCol cols="6">
              <VSelect
                v-model="form.altCountryId"
                :items="countryOptions"
                item-title="title"
                item-value="value"
                :label="t('app.orthoApneaOrder.form.country')"
                :loading="loadingCountries"
                variant="outlined"
                density="comfortable"
              />
            </VCol>
            <VCol cols="6">
              <VTextField v-model="form.altPostalCode" :label="t('app.orthoApneaOrder.form.postalCode')" variant="outlined" density="comfortable" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.altCity" :label="t('app.orthoApneaOrder.form.city')" variant="outlined" density="comfortable" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.altAddress" :label="t('app.orthoApneaOrder.form.address')" variant="outlined" density="comfortable" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.altName" :label="t('app.orthoApneaOrder.form.name')" maxlength="40" variant="outlined" density="comfortable" />
            </VCol>
            <VCol cols="12">
              <EmailField
                v-model="form.altEmail"
                :label="t('app.orthoApneaOrder.form.email')"
                :rules="[translatedEmailRule]"
                variant="outlined"
                density="comfortable"
              />
            </VCol>
            <VCol cols="6">
              <PhoneField
                v-model="form.altPhone"
                :label="t('app.orthoApneaOrder.form.phone')"
                :default-country-code="patientRegion"
                variant="outlined"
                density="comfortable"
              />
            </VCol>
          </VRow>
        </div>

        <!-- Step 2 — Datos de construcción -->
        <div v-else-if="step === 2">
          <VAutocomplete
            v-model="selectedProductIds"
            :items="sortedProductOptions"
            item-title="title"
            item-value="value"
            :label="t('app.orthoApneaOrder.selectProduct')"
            :loading="loadingProducts"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            closable-chips
            hide-selected
          >
            <template #chip="{ item, props: chipProps }">
              <VChip v-bind="chipProps" :color="productChipColor(item.title)" />
            </template>
          </VAutocomplete>

          <p class="text-subtitle2 mt-6 mb-3 text-primary">{{ t("app.orthoApneaOrder.paso1.title") }}</p>
          <VRow>
            <VCol cols="6">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.retrusionMax") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.retrusionMax')" /></p>
              <NumberStepperField v-model="form.retrusionMax" class="mb-4" />
              <!-- No tooltip icon here — confirmed via live capture that
                   Máxima protrusión has no (i) at all on the real site,
                   unlike Máxima retrusión right above it. -->
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.protrusionMax") }}</p>
              <NumberStepperField v-model="form.protrusionMax" />
            </VCol>
            <VCol cols="6" class="oa-wizard__range-col">
              <span class="text-caption text-medium-emphasis">{{ t("app.orthoApneaOrder.form.mandibularRange") }}</span>
              <span class="oa-wizard__range-value">{{ mandibularRange }}</span>
            </VCol>
          </VRow>
          <Transition name="oa-wizard__validation">
            <VAlert v-if="mrMpTouched && !mrMpValid" type="error" variant="tonal" density="comfortable" class="mt-4">
              {{ mrMpErrorMessage }}
            </VAlert>
          </Transition>

          <p class="text-subtitle2 mt-6 mb-3 text-primary">{{ t("app.orthoApneaOrder.form.deviationSectionTitle") }}</p>
          <!-- Izquierda / diagram / Derecha side by side, matching
               OrthoApnea's own layout — the diagram sits between its two
               fields, not stacked below them. -->
          <div class="oa-wizard__section--centered mt-2">
            <div class="oa-wizard__deviation-row mb-4">
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationLeft") }}</p>
                <NumberStepperField v-model="form.deviationLeft" />
              </div>
              <DeviationDiagram :label="t('app.orthoApneaOrder.form.deviationOcclusion')" :right="form.deviationRight" :left="form.deviationLeft" :size="deviationDiagramSize" />
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationRight") }}</p>
                <NumberStepperField v-model="form.deviationRight" />
              </div>
            </div>

            <div class="oa-wizard__deviation-row mb-4">
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationAdvanceLeft") }}</p>
                <NumberStepperField v-model="form.deviationAdvanceLeft" />
              </div>
              <DeviationDiagram :label="t('app.orthoApneaOrder.form.deviationProtrusion')" :right="form.deviationAdvanceRight" :left="form.deviationAdvanceLeft" :size="deviationDiagramSize" />
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationAdvanceRight") }}</p>
                <NumberStepperField v-model="form.deviationAdvanceRight" />
              </div>
            </div>
          </div>

          <VDivider class="my-5" />

          <p class="text-subtitle2 mb-3 text-primary">{{ t("app.orthoApneaOrder.paso2.title") }}</p>

          <!-- Starting Point belongs under Paso 2 on OrthoApnea's own site,
               not Paso 1 — moved here from its previous spot right after the
               deviation section. -->
          <div class="oa-wizard__sp-header">
            <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.startingPointHeader") }}</span>
            <FieldTooltip :text="t('app.orthoApneaOrder.tooltip.startingPoint')" />
          </div>
          <div class="oa-wizard__sp-fields">
            <div class="oa-wizard__sp-field-row">
              <span class="oa-wizard__sp-field-label">{{ t("app.orthoApneaOrder.form.unitPercent") }}:</span>
              <NumberStepperField v-model="form.startingPointPorcentage" :disabled="form.startingPoint != null" class="oa-wizard__sp-field-input" />
            </div>
            <div class="oa-wizard__sp-field-row">
              <span class="oa-wizard__sp-field-label">{{ t("app.orthoApneaOrder.form.unitMm") }}:</span>
              <NumberStepperField v-model="form.startingPoint" :disabled="form.startingPointPorcentage != null" class="oa-wizard__sp-field-input" />
            </div>
          </div>
          <MandibularRuler
            :retrusion-max="form.retrusionMax"
            :protrusion-max="form.protrusionMax"
            :starting-point="form.startingPoint"
            :starting-point-percent="form.startingPointPorcentage"
          />

          <div class="d-flex align-center flex-wrap mb-1 mt-4">
            <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.sequenceType") }}</span>
            <FieldTooltip :text="t('app.orthoApneaOrder.tooltip.sequenceType')" />
            <span class="text-caption text-medium-emphasis ml-2">{{ t("app.orthoApneaOrder.form.sequenceTypeHint") }}</span>
          </div>
          <div class="d-flex align-center flex-wrap ga-4 mb-2">
            <VCheckbox v-model="form.sequenceTypeStandard" color="primary" :label="t('app.orthoApneaOrder.form.sequenceTypeStandard')" hide-details density="compact" @update:model-value="onSequenceTypeStandard" />
            <VCheckbox v-model="form.sequenceTypePersonalized" color="primary" :label="t('app.orthoApneaOrder.form.sequenceTypePersonalized')" hide-details density="compact" @update:model-value="onSequenceTypePersonalized" />
          </div>
          <!-- Shown for both Estándar and Individualizada — confirmed from a
               live OA screenshot that Estándar still displays this row, just
               disabled with its fixed standard values, rather than hiding it
               entirely. Our "standard" values are our own default sequence
               (60/70/80) — OA's own exact standard preset wasn't captured. -->
          <VRadioGroup
            v-model="form.sequenceUnitInMM"
            color="primary"
            inline
            hide-details
            density="compact"
            class="mb-2"
            :disabled="form.sequenceTypeStandard"
          >
            <VRadio :value="true" :label="t('app.orthoApneaOrder.form.unitMm')" />
            <VRadio :value="false" :label="t('app.orthoApneaOrder.form.unitPercent')" />
          </VRadioGroup>
          <p class="oa-wizard__field-label">SP</p>
          <VRow class="mb-1" dense>
            <VCol cols="4"><NumberStepperField v-model="sequence.seq1" :disabled="form.sequenceTypeStandard" /></VCol>
            <VCol cols="4"><NumberStepperField v-model="sequence.seq2" :disabled="form.sequenceTypeStandard" /></VCol>
            <VCol cols="4"><NumberStepperField v-model="sequence.seq3" :disabled="form.sequenceTypeStandard" /></VCol>
          </VRow>

          <div class="d-flex align-center flex-wrap mt-3 mb-2">
            <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.additionalSplints") }}</span>
            <AppButton icon size="small" variant="tonal" color="primary" class="ml-2" :aria-label="t('app.orthoApneaOrder.form.additionalSplintsAdd')" @click="form.additionalSplints.push('')">
              <AppIcon name="plus" />
            </AppButton>
            <span class="text-caption text-medium-emphasis font-italic ml-2">{{ t("app.orthoApneaOrder.form.additionalSplintsHint") }}</span>
          </div>
          <div v-for="(_, idx) in form.additionalSplints" :key="idx" class="d-flex align-center ga-2 mb-2">
            <VTextField v-model="form.additionalSplints[idx]" variant="outlined" density="comfortable" hide-details />
            <AppButton icon size="small" variant="tonal" color="error" :aria-label="t('app.orthoApneaOrder.form.additionalSplintsRemove')" @click="form.additionalSplints.splice(idx, 1)">
              <AppIcon name="trash" />
            </AppButton>
          </div>

          <div class="d-flex align-center mt-2">
            <VCheckbox v-model="form.morningAligner" color="primary" :label="t('app.orthoApneaOrder.form.morningAligner')" hide-details density="compact" />
            <FieldTooltip
              :text="t('app.orthoApneaOrder.tooltip.morningAligner')"
              :image="TOOLTIP_IMG.morningAligner"
              :image-alt="t('app.orthoApneaOrder.form.morningAligner')"
            />
          </div>

          <VDivider class="my-5" />

          <p class="text-subtitle2 mb-2 text-primary">{{ t("app.orthoApneaOrder.paso3.title") }}</p>
          <VSelect
            v-model="form.verticalDimension"
            :items="VERTICAL_DIMENSION_OPTIONS"
            item-title="title"
            item-value="value"
            :label="t('app.orthoApneaOrder.form.verticalDimension')"
            variant="outlined"
            density="comfortable"
          />
          <VRow class="mb-4">
            <VCol cols="6" class="d-flex align-center">
              <VCheckbox v-model="form.anteriorFrontalOpening" color="primary" :label="t('app.orthoApneaOrder.form.anteriorFrontalOpening')" hide-details density="compact" />
              <!-- Image-only on the real site — no explanatory text exists to translate. -->
              <FieldTooltip :image="TOOLTIP_IMG.anteriorFrontalOpening" :image-alt="t('app.orthoApneaOrder.form.anteriorFrontalOpening')" />
            </VCol>
            <VCol cols="6" class="d-flex align-center">
              <VCheckbox v-model="form.slotsForElasticBands" color="primary" :label="t('app.orthoApneaOrder.form.slotsForElasticBands')" hide-details density="compact" />
              <!-- Image-only on the real site — no explanatory text exists to translate. -->
              <FieldTooltip :image="TOOLTIP_IMG.slotsForElasticBands" :image-alt="t('app.orthoApneaOrder.form.slotsForElasticBands')" />
            </VCol>
            <VCol cols="6">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.laterality") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.laterality')" :image="TOOLTIP_IMG.laterality" :image-alt="t('app.orthoApneaOrder.form.laterality')" /></p>
              <NumberStepperField v-model="form.laterality" />
            </VCol>
            <VCol cols="6">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.limitOpening") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.limitOpening')" :image="TOOLTIP_IMG.limitOpening" :image-alt="t('app.orthoApneaOrder.form.limitOpening')" /></p>
              <NumberStepperField v-model="form.limitOpening" />
            </VCol>
          </VRow>
          <div class="oa-wizard__section--centered">
            <p class="text-caption mb-1">{{ t("app.orthoApneaOrder.form.splintDesignUpperBand") }}</p>
            <IconOptionPicker v-model="form.upperBandSplintDesign" :options="BAND_OPTIONS" large hide-labels class="mb-3" />
            <p class="text-caption mb-1">{{ t("app.orthoApneaOrder.form.splintDesignLowerBand") }}</p>
            <IconOptionPicker v-model="form.lowerBandSplintDesign" :options="BAND_OPTIONS" large hide-labels class="mb-3" />
            <p class="text-caption mb-1">{{ t("app.orthoApneaOrder.form.finish") }}</p>
            <IconOptionPicker v-model="form.finish" :options="FINISH_OPTIONS" fill large class="mb-4" />
          </div>

          <VDivider class="my-5" />

          <p class="text-subtitle2 mb-2 text-primary">{{ t("app.orthoApneaOrder.paso4.title") }}</p>
          <div class="oa-wizard__section--centered">
            <TeethDiagram v-model="form.teethStatus" class="mb-4" />
          </div>
          <VTextarea v-model="form.observations" :label="t('app.orthoApneaOrder.form.observations')" variant="outlined" density="comfortable" auto-grow rows="2" />
          <VAlert type="info" variant="tonal" density="comfortable" class="mt-2">
            {{ t("app.orthoApneaOrder.photoUploadDeferredNotice") }}
          </VAlert>
        </div>

        <!-- Step 3 — Registro dental -->
        <div v-else-if="step === 3">
          <VRadioGroup v-model="form.registrationMethod" color="primary" :label="t('app.orthoApneaOrder.form.registrationMethod')">
            <VRadio value="impression" :label="t('app.orthoApneaOrder.form.impressionTraditional')" />
            <VRadio value="scanner" :label="t('app.orthoApneaOrder.form.scannerIntraoral')" />
          </VRadioGroup>

          <template v-if="form.registrationMethod === 'scanner'">
            <VSelect
              v-model="form.scanner"
              :items="SCANNER_OPTIONS"
              :label="t('app.orthoApneaOrder.form.scanner')"
              variant="outlined"
              density="comfortable"
            />
            <VAlert type="info" variant="tonal" density="comfortable">
              {{ t("app.orthoApneaOrder.fileUploadDeferredNotice") }}
            </VAlert>
          </template>
        </div>

        <!-- Review -->
        <div v-else-if="step === 4">
          <!-- "¿Cuándo desea el producto?" stays hidden per product decision — auto-defaulted
               to +15 days (see setDefaultDesiredDate()) and still sent as desiredDate below. -->
          <div class="oa-wizard__promo-row">
            <VTextField v-model="form.promotionCode" :label="t('app.orthoApneaOrder.form.promotionCode')" variant="outlined" density="comfortable" hide-details />
          </div>
          <VCheckbox v-model="form.noContactDoctorForRedesign" color="primary" :label="t('app.orthoApneaOrder.form.noContactDoctorForRedesign')" />

          <VAlert v-if="form.products.length === 0" type="warning" variant="tonal" density="comfortable">
            {{ t("app.orthoApneaOrder.missingProduct") }}
          </VAlert>
        </div>
      </div>
      </Transition>
      </VCardText>

      <VCardActions class="oa-wizard__actions">
        <AppButton v-if="step > 1" icon size="x-large" variant="text" color="primary" :aria-label="t('app.orthoApneaOrder.actions.back')" @click="goBack">
          <AppIcon name="arrow-left" class="oa-wizard__nav-arrow" />
        </AppButton>
        <VSpacer />
        <AppButton variant="text" @click="onCancelClick">{{ t("app.common.cancel") }}</AppButton>
        <AppButton v-if="step < 4" icon size="x-large" variant="text" color="primary" :disabled="!canAdvance" :aria-label="t('app.orthoApneaOrder.actions.next')" @click="goNext">
          <AppIcon name="arrow-right" class="oa-wizard__nav-arrow" />
        </AppButton>
        <AppButton v-else color="primary" :loading="submitLoading" :disabled="form.products.length === 0" @click="onConfirm">
          {{ t("app.orthoApneaOrder.actions.confirm") }}
        </AppButton>
      </VCardActions>
    </VCard>

    <AppConfirmDialog
      v-model="showDraftPrompt"
      :title="t('app.orthoApneaOrder.draftPromptTitle')"
      :text="t('app.orthoApneaOrder.draftPromptText')"
      :secondary-label="t('app.orthoApneaOrder.discardDraft')"
      :primary-label="t('app.orthoApneaOrder.saveDraft')"
      :loading="savingDraft"
      @secondary="discardDraft"
      @primary="saveDraftAndClose"
    />
  </VDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import { originDialogTransition } from "@ui";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import IconOptionPicker, { type IconOption } from "./IconOptionPicker.vue";
import TeethDiagram from "./TeethDiagram.vue";
import DeviationDiagram from "./DeviationDiagram.vue";
import MandibularRuler from "./MandibularRuler.vue";
import FieldTooltip from "./FieldTooltip.vue";
import NumberStepperField from "./NumberStepperField.vue";
import PhoneField from "../PhoneField.vue";
import EmailField from "../EmailField.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import { useNotifications } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { emailFormatRule } from "../../config/forms/identityFields";
import {
  useOrthoApneaOrderWizard,
  type OrthoApneaProduct,
  type OrthoApneaDraftPlan,
} from "../../composables/useOrthoApneaOrderWizard";

/**
 * Full-fidelity replica of OrthoApnea's own 3-step order wizard (Envío →
 * Datos de construcción → Registro dental), field names kept identical to
 * OrthoApnea's own API (see apps/api's orthoapnea.ts field-mapping) so the
 * payload sent to POST /api/v1/partners/orthoapnea/treatments is a direct
 * pass-through, not a translation layer.
 *
 * Paso 3 ("Diseño del dispositivo") and Paso 4's teeth diagram are built with
 * NeoSleep's own redrawn icons (TeethDiagram.vue, IconOptionPicker.vue) —
 * OrthoApnea's own icon/tooth artwork isn't ours to embed, see those files'
 * own comments. Deliberately still deferred for a fast-follow (flagged
 * inline via VAlerts, not silently dropped): the dynamic "+" secondary
 * splints list, and both file upload widgets (photo/CBCT here, digital scan
 * files in step 3) — their OrthoApnea-side request shape is still
 * unconfirmed (see the consolidated live-capture round in the project plan).
 * None of these block a real order: OrthoApnea's own wizard marks all of
 * them optional, and "Registro dental" can be submitted via the
 * "Impresión tradicional" (physical) path without any upload at all.
 *
 * "Médico" vs. OrthoApnea's "clinic": OrthoApnea's own Step 1 field
 * (formcontrolname="clinic") actually renders a doctor's name on the shared
 * account (there's exactly one clinic tied to it), not a location picker.
 * Rather than surface that single fixed value as a no-op dropdown, this
 * field is repurposed as a real choice from OUR OWN practitioner list —
 * defaults to the patient's assigned HCP, falling back to "Lorena" (the
 * OrthoApnea account holder) when the patient has none — and sets
 * treatment_plan.dentist_id locally. The one real OA `clinic` id is still
 * resolved and sent silently (loadClinic()), since that's what their API
 * actually expects; the user never needs to see or choose it.
 *
 * Product selection is multi-select (chips, removable) per product decision
 * — see buildWizardPayload()'s own comment for why that becomes N separate
 * local orders rather than one order with an array of products (unconfirmed
 * shape). "¿Cuándo desea el producto?" is intentionally not shown anywhere
 * in this UI — see setDefaultDesiredDate() for why a value is still computed
 * and sent. The deviation diagrams and mandibular-advancement ruler render
 * OrthoApnea's own downloaded images with NeoSleep's own approximated
 * value→position math (their internal formula wasn't captured) — see
 * DeviationDiagram.vue / MandibularRuler.vue.
 */

// OrthoApneaProduct/OrthoApneaDraftPlan now live in useOrthoApneaOrderWizard.ts
// (the composable owns the reactive state built from them) — re-exported here
// so PatientOrthoApneaPanel.vue's existing `import { type OrthoApneaDraftPlan }
// from "./OrthoApneaOrderWizard.vue"` keeps working unchanged.
export type { OrthoApneaDraftPlan };

const props = defineProps<{
  modelValue: boolean;
  patientId: string;
  sleepStudyId: string;
  draftPlan?: OrthoApneaDraftPlan | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submitted: [];
}>();

const { t } = useI18n();
const notifications = useNotifications();
/** Shrinks the deviation diagrams on narrow viewports so the Izquierda/
 * diagram/Derecha row fits without horizontal overflow — the fixed-px
 * "large" size only fits comfortably on wider screens. */
const { mobile } = useDisplay();
const deviationDiagramSize = computed(() => (mobile.value ? "normal" : "large"));

const SCANNER_OPTIONS = [
  "Aoralscan Shining 3D", "Carestream", "Dental Wings", "Heron", "Itero", "Medit",
  "NeoScan 1000", "Sirona", "Planmeca Emerald", "3Shape Trios", "Shining 3D", "Desconocido",
];

const VERTICAL_DIMENSION_OPTIONS = [
  { title: "Mínima", value: "minimal" },
  { title: "Registro", value: "registro" },
];

/** OrthoApnea's own reference images, downloaded locally (see assets/orthoapnea/ — public static files, not behind their auth). */
function bandImg(n: number): string {
  return new URL(`../../assets/orthoapnea/splint-design/oa-band-${n}.png`, import.meta.url).href;
}
const BAND_OPTIONS: IconOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n), imgSrc: bandImg(n) }));

const FINISH_OPTIONS: IconOption[] = [
  { value: "mixedSplintDesign", label: "Normal", imgSrc: new URL("../../assets/orthoapnea/splint-design/mixedSplintDesign.png", import.meta.url).href },
  { value: "scallopedSplintDesign", label: "Aliviar", imgSrc: new URL("../../assets/orthoapnea/splint-design/scallopedSplintDesign.png", import.meta.url).href },
];

/** OrthoApnea's own tooltip images, confirmed via live capture and
 * downloaded locally (see assets/orthoapnea/tooltips/ — public static
 * files, not behind their auth). See docs/orthoapnea-wizard-fidelity.md. */
const TOOLTIP_IMG = {
  morningAligner: new URL("../../assets/orthoapnea/tooltips/morning-aligner.jpg", import.meta.url).href,
  anteriorFrontalOpening: new URL("../../assets/orthoapnea/tooltips/frontal-opening.jpeg", import.meta.url).href,
  slotsForElasticBands: new URL("../../assets/orthoapnea/tooltips/elastic-band-hooks.jpg", import.meta.url).href,
  laterality: new URL("../../assets/orthoapnea/tooltips/laterality.jpg", import.meta.url).href,
  limitOpening: new URL("../../assets/orthoapnea/tooltips/limit-opening.png", import.meta.url).href,
};

/** NOA and Morning Aligner are pinned first (NOA auto-selected too), then
 * each family's own variants (reimpresión/replanificación etc.), then
 * Orthobrux's variants, then everything else — per product decision, not
 * OrthoApnea's own catalog order. */
/** Family color for a product chip, matching OrthoApnea's own catalog
 * coloring — NOA (dark blue) and Morning Aligner (blue) so the two most
 * commonly ordered families are visually distinct at a glance. */
function productChipColor(name: string): string | undefined {
  const upper = name.toUpperCase();
  if (upper.includes("NOA")) return "primary-darken-1";
  if (upper.includes("MORNING ALIGNER")) return "blue";
  return undefined;
}

function productSortRank(p: OrthoApneaProduct): number {
  const name = p.nameEs.toUpperCase();
  if (name === "NOA") return 0;
  if (name === "MORNING ALIGNER") return 1;
  if (name.includes("NOA")) return 2;
  if (name.includes("MORNING ALIGNER")) return 3;
  if (name.includes("ORTHOBRUX")) return 4;
  return 5;
}

/** OrthoApnea's full catalog has many products this rep never orders — only
 * the NOA/Morning Aligner/Orthobrux families are offered here, per product
 * decision (everything else stays selectable directly in OrthoApnea if ever
 * needed, this wizard just doesn't surface it). */
function isOfferedProductFamily(p: OrthoApneaProduct): boolean {
  const name = p.nameEs.toUpperCase();
  return name.includes("NOA") || name.includes("MORNING ALIGNER") || name.includes("ORTHOBRUX");
}

const step = ref(1);
const maxReachedStep = ref(1);
/** Drives the step content's slide direction (see .oa-wizard__step-slide-*
 *  transitions) — set right before `step` itself changes, from whichever of
 *  goNext/goBack/goToStep is doing the navigating. */
const stepTransitionName = ref<"oa-wizard-step-slide-forward" | "oa-wizard-step-slide-back">("oa-wizard-step-slide-forward");

/** True once the form differs from what it was right after opening — drives
 * whether closing prompts "save as draft?" at all (a wizard opened and
 * immediately closed has nothing worth saving). */
const touched = ref(false);
const showDraftPrompt = ref(false);

const {
  form,
  sequence,
  products,
  loadingProducts,
  doctorOptions,
  loadingDoctors,
  countryOptions,
  loadingCountries,
  patientRegion,
  resetForOpen,
  loadProducts,
  loadClinic,
  loadDoctorsAndDefault,
  loadCountries,
  confirmOrder,
  persistDraft,
} = useOrthoApneaOrderWizard();

const sortedProductOptions = computed(() =>
  products.value
    .filter(isOfferedProductFamily)
    .sort((a, b) => productSortRank(a) - productSortRank(b) || a.nameEs.localeCompare(b.nameEs))
    .map((p) => ({ title: p.nameEs, value: p.id }))
);

const selectedProductIds = computed<number[]>({
  get: () => form.products.map((p) => p.id),
  set: (ids) => {
    form.products = ids
      .map((id) => products.value.find((p) => p.id === id))
      .filter((p): p is OrthoApneaProduct => !!p);
  },
});

// See the open-watcher's nextTick() call for why this doesn't false-positive
// right after loading defaults/a resumed draft.
watch(form, () => { touched.value = true; }, { deep: true });

/** Morning Aligner is both a standalone checkbox AND a selectable product in
 * OrthoApnea's own catalog — the two must always agree, in either direction:
 * checking the box adds "MORNING ALIGNER" to the selected-products chips,
 * and removing that chip directly (or adding it) must update the checkbox
 * too, not just the one-directional case. Each watcher only writes when the
 * derived state actually differs, so the pair settles in one tick instead of
 * ping-ponging. */
watch(
  () => form.morningAligner,
  (checked) => {
    const morningAligner = products.value.find((p) => p.nameEs.toUpperCase() === "MORNING ALIGNER");
    if (!morningAligner) return;
    const idx = form.products.findIndex((p) => p.id === morningAligner.id);
    if (checked && idx === -1) form.products.push(morningAligner);
    else if (!checked && idx !== -1) form.products.splice(idx, 1);
  }
);
watch(
  () => form.products.some((p) => p.nameEs.toUpperCase() === "MORNING ALIGNER"),
  (present) => {
    form.morningAligner = present;
  }
);

const mandibularRange = computed(() => (form.protrusionMax ?? 0) - (form.retrusionMax ?? 0));

/** emailFormatRule (config/forms/identityFields.ts) returns an untranslated
 * i18n key on failure, meant to be translated by FormRenderer's rulesFor() —
 * this wizard isn't FormRenderer-driven, so it translates the key itself. */
function translatedEmailRule(v: unknown): true | string {
  const result = emailFormatRule(v);
  return result === true ? true : t(result);
}

/** Step 1 is only valid once the alternative-address sub-form (when shown) is
 * fully filled in — OrthoApnea's own required-field set isn't confirmed yet
 * (pending live capture), so this requires everything shown as a safe
 * default rather than guessing which fields are actually optional. */
const step1Valid = computed(() => {
  if (!form.doctorId) return false;
  if (form.addressSend !== "alternative") return true;
  return !!(
    form.altCountryId &&
    form.altPostalCode.trim() &&
    form.altCity.trim() &&
    form.altAddress.trim() &&
    form.altName.trim() &&
    form.altEmail.trim() &&
    emailFormatRule(form.altEmail) === true
  );
});

/** Confirmed real OA constraints (live-captured): MR and MP must each fall
 * within [-20, 20]mm, and MR must be strictly less than MP — their form
 * blocks advancing with an inline error otherwise. */
const MR_MP_RANGE_MM = 20;
const mrInRange = computed(() => {
  const mr = form.retrusionMax ?? 0;
  return mr >= -MR_MP_RANGE_MM && mr <= MR_MP_RANGE_MM;
});
const mpInRange = computed(() => {
  const mp = form.protrusionMax ?? 0;
  return mp >= -MR_MP_RANGE_MM && mp <= MR_MP_RANGE_MM;
});
const mrLessThanMp = computed(() => (form.retrusionMax ?? 0) < (form.protrusionMax ?? 0));
const mrMpValid = computed(() => mrInRange.value && mpInRange.value && mrLessThanMp.value);

/** Range errors take priority over the relational one — fixing the range
 * usually also needs addressing first, and showing both at once is noisy. */
const mrMpErrorMessage = computed(() => {
  if (!mrInRange.value || !mpInRange.value) return t("app.orthoApneaOrder.validation.mrMpOutOfRange");
  return t("app.orthoApneaOrder.validation.mrMustBeLessThanMp");
});

/** Suppressed until the rep actually edits MR/MP — both start at 0 (0 is not
 * < 0), which would otherwise show an error before any real input. Reset
 * alongside `touched` on wizard open (see that watcher's own nextTick note —
 * same reason: resetForOpen()'s own assignment must not count as "touched"). */
const mrMpTouched = ref(false);
watch(() => [form.retrusionMax, form.protrusionMax], () => { mrMpTouched.value = true; });

/** Step 2 requires at least one product (a real order needs one) and the
 * MR/MP constraints above to hold. */
const step2Valid = computed(() => form.products.length > 0 && mrMpValid.value);

const canAdvance = computed(() => {
  if (step.value === 1) return step1Valid.value;
  if (step.value === 2) return step2Valid.value;
  return true;
});

function goNext() {
  if (!canAdvance.value) return;
  stepTransitionName.value = "oa-wizard-step-slide-forward";
  step.value += 1;
  if (step.value > maxReachedStep.value) maxReachedStep.value = step.value;
}

function goBack() {
  stepTransitionName.value = "oa-wizard-step-slide-back";
  step.value -= 1;
}

/** Only steps already reached (and, implicitly, validated on the way there via goNext) are clickable. */
function goToStep(target: number) {
  if (target <= maxReachedStep.value) {
    stepTransitionName.value = target >= step.value ? "oa-wizard-step-slide-forward" : "oa-wizard-step-slide-back";
    step.value = target;
  }
}

function onSequenceTypeStandard(value: boolean | null) {
  if (value) form.sequenceTypePersonalized = false;
}
function onSequenceTypePersonalized(value: boolean | null) {
  if (value) form.sequenceTypeStandard = false;
}

const { loading: submitLoading, run: onConfirm } = useAsyncAction(async () => {
  const shouldClose = await confirmOrder(props.patientId, props.sleepStudyId);
  if (shouldClose) {
    emit("submitted");
    emit("update:modelValue", false);
  }
});

function closeImmediately() {
  showDraftPrompt.value = false;
  emit("update:modelValue", false);
}

/** X button / Cancel — prompts to save a draft only if something actually changed since opening. */
function requestClose() {
  if (touched.value) {
    showDraftPrompt.value = true;
  } else {
    closeImmediately();
  }
}

function discardDraft() {
  closeImmediately();
}

const { loading: savingDraft, run: saveDraftAndClose } = useAsyncAction(async () => {
  const ok = await persistDraft(props.patientId, props.sleepStudyId);
  if (ok) {
    notifications.show(t("app.orthoApneaOrder.draftSaved"), "success");
    emit("submitted"); // refresh the panel's list so the new/updated draft shows up
    closeImmediately();
  } else {
    notifications.show(t("app.orthoApneaOrder.error"), "error");
  }
});

function onDialogUpdate(value: boolean) {
  if (!value) requestClose();
}
function onCancelClick() {
  requestClose();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      resetForOpen(props.draftPlan);

      step.value = 1;
      maxReachedStep.value = 1;
      showDraftPrompt.value = false;
      loadProducts();
      loadClinic();
      loadDoctorsAndDefault(props.patientId);
      loadCountries();

      // Reset the "touched" flags AFTER resetForOpen()'s Object.assign calls
      // have already triggered the deep watcher once — nextTick so it
      // doesn't immediately flip back to true from our own initialization.
      nextTick(() => {
        touched.value = false;
        mrMpTouched.value = false;
      });
    }
  }
);
</script>

<style scoped>
.oa-wizard__title-row {
  display: flex;
  align-items: center;
  margin: 8px 8px 0;
}

.oa-wizard__stepper {
  box-shadow: none;
}

.oa-wizard__body {
  max-height: 55vh;
  overflow-y: auto;
}

/* Right half of the MR/MP row — "Rango avance mandibular" filling the
   remaining 50% of the row's width, scaled up since it's the only content
   in that half (matches the left half's MR+MP visual weight). */
.oa-wizard__range-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 4px;
}

.oa-wizard__range-value {
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1;
  color: rgb(var(--v-theme-primary));
}

/* Reserves no space when hidden (per feedback: must not show before the rep
   actually changes MR/MP — see mrMpTouched) but animates smoothly in/out
   rather than snapping, so a genuine appearance/disappearance still reads
   as intentional feedback, not a layout jolt. */
.oa-wizard__validation-enter-active,
.oa-wizard__validation-leave-active {
  transition: opacity 0.25s ease-out, max-height 0.25s ease-out, margin-top 0.25s ease-out;
  overflow: hidden;
}
.oa-wizard__validation-enter-from,
.oa-wizard__validation-leave-to {
  opacity: 0;
  max-height: 0;
  margin-top: 0 !important;
}
.oa-wizard__validation-enter-to,
.oa-wizard__validation-leave-from {
  opacity: 1;
  max-height: 100px;
}

/* Plain label + tooltip pair sitting ABOVE its field, replacing Vuetify's
   own floating :label slot for any field that carries a FieldTooltip — the
   floating label clips/shrinks its slot content on focus, which was making
   those tooltip icons unclickable and mispositioned (see FieldTooltip.vue). */
.oa-wizard__field-label {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  margin-bottom: 4px;
}

.oa-wizard__field-label--centered {
  justify-content: center;
  width: 100%;
}

.oa-wizard__sp-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.oa-wizard__sp-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  margin-bottom: 12px;
}

.oa-wizard__sp-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.oa-wizard__sp-field-label {
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
  width: 32px;
  text-align: right;
}

.oa-wizard__sp-field-input {
  width: 220px;
}

/* Izquierda / diagram / Derecha side by side — matches OrthoApnea's own
   layout, the field a fixed width on each side so the diagram stays
   centered regardless of how wide the numbers inside the steppers get. */
.oa-wizard__deviation-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.oa-wizard__deviation-field {
  width: 210px;
  flex-shrink: 0;
}

/* Mobile: the diagram already switches to its smaller "normal" size (see
   deviationDiagramSize), but the fields on either side also need to shrink
   or the row still overflows a narrow viewport. */
@media (max-width: 600px) {
  .oa-wizard__deviation-row {
    gap: 6px;
  }
  .oa-wizard__deviation-field {
    /* Floor set by NumberStepperField's own two buttons + minimum input
       width, not an arbitrary number — going narrower would clip it. */
    width: 170px;
  }
}

/* Paso 3 (band/finish pickers) and Paso 4 (teeth diagram) share this same
   max-width, centered, so both sections read as equally wide instead of the
   teeth diagram looking narrower/off-center next to the pickers above it. */
.oa-wizard__section--centered {
  max-width: 800px;
  margin: 0 auto;
  /* Safety net, not the primary fix — deviationDiagramSize + the mobile
     .oa-wizard__deviation-field width above should already fit narrow
     viewports without ever needing to actually scroll. */
  overflow-x: auto;
}

.oa-wizard__promo-row {
  margin: 8px 0;
}

.oa-wizard__actions {
  margin: 0 8px 8px;
}

.oa-wizard__nav-arrow {
  width: 44px;
  height: 44px;
}

/* Vuetify's own .v-stepper-item has a transition-duration for its opacity
   swap, but the circle's fill color (unvisited → complete/selected) has no
   transition at all — it just snaps, which is the "hard" step-to-step feel
   this softens. */
.oa-wizard__stepper :deep(.v-stepper-item__avatar) {
  transition: background-color 280ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)),
    color 280ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Forward: new step slides in from the right, old one exits to the left.
   Back: mirrored. mode="out-in" (see the <Transition> in the template) means
   the leave finishes before the enter starts, which keeps the wizard's
   variable-height steps from ever overlapping mid-transition. */
.oa-wizard-step-slide-forward-enter-active,
.oa-wizard-step-slide-forward-leave-active,
.oa-wizard-step-slide-back-enter-active,
.oa-wizard-step-slide-back-leave-active {
  transition: transform 320ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 320ms var(--pwa-ease-out-smooth, cubic-bezier(0.22, 1, 0.36, 1));
}

.oa-wizard-step-slide-forward-enter-from {
  transform: translateX(24px);
  opacity: 0;
}
.oa-wizard-step-slide-forward-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}
.oa-wizard-step-slide-back-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}
.oa-wizard-step-slide-back-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.oa-wizard__step--clickable {
  cursor: pointer;
}
</style>
