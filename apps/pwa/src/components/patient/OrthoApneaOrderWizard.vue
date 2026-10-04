<template>
  <AppFormDialog
    :model-value="modelValue"
    max-width="880"
    persistent
    :title="t('app.orthoApneaOrder.title')"
    @update:model-value="onDialogUpdate"
    @close="onCancelClick"
  >
    <template #header-extra>
      <VStepper :model-value="step - firstStep + 1" flat class="oa-wizard__stepper" hide-actions>
        <VStepperHeader>
          <!-- Numbered 1..n over the steps this user walks: a doctor has no step 1 (NEO-210). -->
          <template v-for="(s, i) in stepperItems" :key="s.step">
            <VDivider v-if="i > 0" />
            <VStepperItem
              color="primary"
              :title="s.title"
              :value="i + 1"
              :complete="s.step < 4 && step > s.step"
              :class="{ 'oa-wizard__step--clickable': maxReachedStep >= s.step }"
              :data-testid="`wizard-step-${s.step}`"
              @click="goToStep(s.step)"
            />
          </template>
        </VStepperHeader>
      </VStepper>
    </template>

      <Transition :name="stepTransitionName" mode="out-in">
      <div :key="step" ref="stepEl">
        <!-- NEO-109: this step's errors, only after a Next/Confirm attempt on it. -->
        <FormErrorSummary :errors="errorList" :title="t('app.formRenderer.errorSummary.title', { n: errorList.length })" @select="focusField" />

        <!-- Step 1 — Envío: who orders, and (read-only) where it ships: the doctor's primary HCO. -->
        <div v-if="step === 1">
          <AppInlineAlert v-if="labOrdersDisabledMessage" type="warning" class="mb-4" data-testid="lab-orders-disabled">
            {{ labOrdersDisabledMessage }}
          </AppInlineAlert>
          <div data-field="dentistId">
            <VAutocomplete
              :model-value="order.dentistId || null"
              :items="doctorOptions"
              item-title="title"
              item-value="value"
              :label="t('app.orthoApneaOrder.form.doctor')"
              :loading="loadingDoctors"
              :error-messages="fieldError('dentistId')"
              variant="outlined"
              density="comfortable"
              @update:model-value="onDoctorPicked"
            />
          </div>

          <div v-if="order.dentistId" class="oa-wizard__ship-to" data-field="delivery" data-testid="ship-to">
            <p class="oa-wizard__field-label">{{ t("app.deviceOrder.delivery.title") }}</p>
            <!-- Admin only, when the doctor has several clinics: ship to another one than the primary (NEO-210 D2). -->
            <div v-if="clinicItems.length > 1" data-field="deliveryOrganizationId" class="mb-2">
              <VSelect
                :model-value="selectedClinicId"
                :items="clinicItems"
                item-title="title"
                item-value="value"
                :aria-label="t('app.deviceOrder.delivery.chooseClinic')"
                variant="outlined"
                density="comfortable"
                hide-details
                @update:model-value="onClinicPicked"
              />
            </div>
            <p v-if="contextLoading" class="text-body-medium text-medium-emphasis">{{ t("app.deviceOrder.delivery.loading") }}</p>
            <address v-else-if="context?.delivery" class="oa-wizard__address">
              <strong>{{ context.delivery.name }}</strong><br />
              {{ context.delivery.address }}<br />
              {{ [context.delivery.postalCode, context.delivery.city].filter(Boolean).join(" ") }}<template v-if="context.delivery.countryCode">, {{ context.delivery.countryCode }}</template><br />
              {{ [context.delivery.phone, context.delivery.email].filter(Boolean).join(" · ") }}
            </address>
            <AppInlineAlert v-if="deliveryMessage" type="error" class="mt-2" data-testid="ship-to-error">
              {{ deliveryMessage }}
              <a v-if="recordHref && !contextFailed" :href="recordHref" target="_blank" rel="noopener" class="oa-wizard__alert-link">{{ t("app.deviceOrder.delivery.openRecord") }}</a>
              <AppButton v-if="contextFailed" variant="text" size="small" color="primary" @click="refreshContext(true)">{{ t("app.deviceOrder.delivery.retry") }}</AppButton>
            </AppInlineAlert>
          </div>
        </div>

        <!-- Step 2 — Datos de construcción -->
        <div v-else-if="step === 2">
          <!-- A doctor has no step 1, so the kill-switch notice shows here instead (NEO-210). -->
          <AppInlineAlert v-if="isDoctor && labOrdersDisabledMessage" type="warning" class="mb-4" data-testid="lab-orders-disabled">
            {{ labOrdersDisabledMessage }}
          </AppInlineAlert>
          <!-- A doctor has no step 1: a problem with their clinic's address shows here, with whom to contact (NEO-210). -->
          <div v-if="isDoctor && doctorDeliveryMessage" data-field="delivery" class="mb-4">
            <AppInlineAlert type="error" :title="t('app.deviceOrder.delivery.doctorTitle')" data-testid="doctor-address-error">
              {{ doctorDeliveryMessage }}
              <AppButton v-if="contextFailed" variant="text" size="small" color="primary" @click="refreshContext(true)">{{ t("app.deviceOrder.delivery.retry") }}</AppButton>
            </AppInlineAlert>
          </div>
          <!-- Only shown when there is a choice: today the wizard orders NOA only. -->
          <div v-if="productOptions.length > 1" data-field="productCode" class="oa-wizard__center">
            <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.selectProduct") }}</p>
            <AppSegmentedTabs :model-value="order.productCode" :options="productOptions" fit class="oa-wizard__switch" @update:model-value="onProductPicked" />
          </div>

          <p class="text-subtitle2 mt-6 mb-4 text-primary">{{ t("app.orthoApneaOrder.paso1.title") }}</p>
          <VRow>
            <VCol cols="6" class="oa-wizard__center">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.retrusionMax") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.retrusionMax')" /></p>
              <NumberStepperField
                :model-value="order.retrusionMaxMm"
                data-field="retrusionMaxMm"
                :error="!!fieldError('retrusionMaxMm')"
                class="mb-4"
                @update:model-value="(v) => (order.retrusionMaxMm = v ?? 0)"
              />
              <!-- No tooltip icon here — Máxima protrusión has no (i) on OA's own form. -->
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.protrusionMax") }}</p>
              <NumberStepperField
                :model-value="order.protrusionMaxMm"
                data-field="protrusionMaxMm"
                :error="!!fieldError('protrusionMaxMm')"
                @update:model-value="(v) => (order.protrusionMaxMm = v ?? 0)"
              />
            </VCol>
            <VCol cols="6" class="oa-wizard__range-col">
              <span class="text-body-small text-medium-emphasis">{{ t("app.orthoApneaOrder.form.mandibularRange") }}</span>
              <span class="oa-wizard__range-value">{{ mandibularRange }}</span>
            </VCol>
          </VRow>
          <Transition name="oa-wizard__validation">
            <AppInlineAlert v-if="mrMpError" type="error" class="mt-4" data-testid="mr-mp-error">
              {{ mrMpError }}
            </AppInlineAlert>
            <div v-else-if="mrMpWarning" class="mt-4">
              <AppInlineAlert type="warning" data-testid="mr-mp-warning">
                {{ mrMpWarning.message }}
              </AppInlineAlert>
              <!-- Łukasz D1: OA only warns; we also make the doctor confirm it. -->
              <VCheckbox
                v-if="mrMpWarning.confirmable"
                :model-value="order.acknowledgedWarnings.includes(mrMpWarning.code)"
                color="primary"
                density="compact"
                hide-details="auto"
                data-testid="confirm-advance-under5"
                :label="t('app.deviceOrder.confirmAdvanceUnder5')"
                :error-messages="mrMpConfirmError"
                @update:model-value="onWarningConfirmed"
              />
            </div>
          </Transition>

          <p class="text-subtitle2 mt-6 mb-3 text-primary">{{ t("app.orthoApneaOrder.form.deviationSectionTitle") }}</p>
          <div class="oa-wizard__section--centered mt-2">
            <div class="oa-wizard__deviation-row mb-4">
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationLeft") }}</p>
                <NumberStepperField :model-value="order.deviation.leftMm" @update:model-value="(v) => (order.deviation.leftMm = v ?? 0)" />
              </div>
              <DeviationDiagram :label="t('app.orthoApneaOrder.form.deviationOcclusion')" :right="order.deviation.rightMm" :left="order.deviation.leftMm" :size="deviationDiagramSize" />
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationRight") }}</p>
                <NumberStepperField :model-value="order.deviation.rightMm" @update:model-value="(v) => (order.deviation.rightMm = v ?? 0)" />
              </div>
            </div>

            <div class="oa-wizard__deviation-row mb-4">
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationAdvanceLeft") }}</p>
                <NumberStepperField :model-value="order.deviation.leftAdvanceMm" @update:model-value="(v) => (order.deviation.leftAdvanceMm = v ?? 0)" />
              </div>
              <DeviationDiagram :label="t('app.orthoApneaOrder.form.deviationProtrusion')" :right="order.deviation.rightAdvanceMm" :left="order.deviation.leftAdvanceMm" :size="deviationDiagramSize" />
              <div class="oa-wizard__deviation-field">
                <p class="oa-wizard__field-label oa-wizard__field-label--centered">{{ t("app.orthoApneaOrder.form.deviationAdvanceRight") }}</p>
                <NumberStepperField :model-value="order.deviation.rightAdvanceMm" @update:model-value="(v) => (order.deviation.rightAdvanceMm = v ?? 0)" />
              </div>
            </div>
          </div>

          <VDivider class="my-10" />

          <!-- Paso 2 is a size container: below 600 px of dialog width (phone, narrow
               tablet) its blocks stack and centre (NEO-225). -->
          <section class="oa-wizard__paso2">
          <p class="text-subtitle2 mb-4 text-primary">{{ t("app.orthoApneaOrder.paso2.title") }}</p>

          <!-- Starting Point: % or mm, whichever the doctor fills (the other is locked);
               the order carries that one, the hint shows it in mm. Ruler 7 / steppers 5
               when wide, steppers above the ruler when narrow; the ruler can be dragged:
               a drag writes mm (NEO-225). -->
          <div data-field="startingPoint" class="oa-wizard__sp">
            <div class="oa-wizard__sp-header">
              <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.startingPointHeader") }}</span>
              <FieldTooltip :text="t('app.orthoApneaOrder.tooltip.startingPoint')" />
            </div>
            <div class="oa-wizard__sp-body">
              <MandibularRuler
                class="oa-wizard__sp-ruler"
                :retrusion-max="order.retrusionMaxMm"
                :protrusion-max="order.protrusionMaxMm"
                :starting-point-mm="spMm"
                :slider-label="t('app.deviceOrder.startingPointRuler')"
                @update:starting-point-mm="(mm) => setStartingPoint('mm', mm)"
              />
              <div class="oa-wizard__sp-fields">
                <div class="oa-wizard__sp-field-row">
                  <span class="oa-wizard__sp-field-label">{{ t("app.orthoApneaOrder.form.unitPercent") }}:</span>
                  <NumberStepperField
                    :model-value="spInput('%')"
                    :disabled="spLocked('%')"
                    :error="!!fieldError('startingPoint')"
                    class="oa-wizard__sp-field-input"
                    data-testid="sp-percent"
                    @update:model-value="(v) => setStartingPoint('%', v)"
                  />
                </div>
                <div class="oa-wizard__sp-field-row">
                  <span class="oa-wizard__sp-field-label">{{ t("app.orthoApneaOrder.form.unitMm") }}:</span>
                  <NumberStepperField
                    :model-value="spInput('mm')"
                    :disabled="spLocked('mm')"
                    :error="!!fieldError('startingPoint')"
                    class="oa-wizard__sp-field-input"
                    data-testid="sp-mm"
                    @update:model-value="(v) => setStartingPoint('mm', v)"
                  />
                </div>
                <!-- One line of reserved height: the hint or error fills it, the layout never jumps. -->
                <div class="oa-wizard__sp-message" data-testid="sp-message" aria-live="polite">
                  <span v-if="fieldError('startingPoint')" class="oa-wizard__field-error">{{ fieldError("startingPoint") }}</span>
                  <span v-else-if="spHint" class="text-body-small text-medium-emphasis" data-testid="sp-hint">{{ spHint }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sequence type: one choice, same segmented switch as Paso 4's Normal/Aliviar. -->
          <div data-field="sequence" data-testid="sequence">
            <div class="d-flex align-center flex-wrap mb-1 mt-4">
              <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.sequenceType") }}</span>
              <FieldTooltip :text="t('app.orthoApneaOrder.tooltip.sequenceType')" />
              <span class="text-body-small text-medium-emphasis ml-2">{{ sequenceHint }}</span>
            </div>
            <AppSegmentedTabs :model-value="order.sequence.type" :options="sequenceTypeOptions" fit class="oa-wizard__switch mb-3" @update:model-value="onSequenceTypePicked" />

            <div v-if="!personalized" class="oa-wizard__seq-row" data-testid="standard-sequence">
              <span class="oa-wizard__seq-unit">{{ t("app.orthoApneaOrder.form.unitMm") }}</span>
              <span class="oa-wizard__seq-cell">{{ t("app.deviceOrder.sequence.sp") }}</span>
              <span v-for="offset in standardOffsets" :key="offset" class="oa-wizard__seq-cell">{{ offset }}</span>
            </div>

            <template v-else>
              <div class="oa-wizard__seq-row" data-testid="personalized-sequence">
                <VRadioGroup :model-value="personalized.unit" color="primary" hide-details density="compact" class="oa-wizard__seq-units" @update:model-value="onSequenceUnitPicked">
                  <VRadio value="mm" :label="t('app.orthoApneaOrder.form.unitMm')" />
                  <VRadio value="%" :label="t('app.orthoApneaOrder.form.unitPercent')" />
                </VRadioGroup>
                <span class="oa-wizard__seq-cell">{{ t("app.deviceOrder.sequence.sp") }}</span>
                <VTextField
                  v-for="(value, idx) in personalized.values"
                  :key="idx"
                  :model-value="value"
                  type="number"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="oa-wizard__seq-input"
                  :aria-label="t('app.deviceOrder.sequence.splint', { n: idx + 1 })"
                  :error="hasIssueAt(`sequence.values.${idx}`)"
                  @update:model-value="(v) => setSequenceValue(idx, toNumber(v))"
                />
              </div>
              <span v-if="fieldError('sequence')" class="oa-wizard__field-error">{{ fieldError("sequence") }}</span>

              <div class="d-flex align-center flex-wrap mt-3 mb-2" data-field="sequence.additionalSplints">
                <span class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.additionalSplints") }}</span>
                <AppButton
                  icon
                  size="small"
                  variant="tonal"
                  color="primary"
                  class="ml-2"
                  :disabled="additionalSplintInputs.length >= 3"
                  :aria-label="t('app.orthoApneaOrder.form.additionalSplintsAdd')"
                  @click="addAdditionalSplint"
                >
                  <AppIcon name="plus" />
                </AppButton>
                <span class="text-body-small text-medium-emphasis font-italic ml-2">{{ t("app.orthoApneaOrder.form.additionalSplintsHint") }} · {{ t("app.deviceOrder.sequence.additionalSplintsMax") }}</span>
              </div>
              <div v-for="(value, idx) in additionalSplintInputs" :key="idx" class="d-flex align-center ga-2 mb-2">
                <VTextField
                  :model-value="value"
                  type="number"
                  variant="outlined"
                  density="comfortable"
                  hide-details
                  :aria-label="t('app.orthoApneaOrder.form.additionalSplints')"
                  @update:model-value="(v) => setAdditionalSplint(idx, toNumber(v))"
                />
                <AppButton icon size="small" variant="tonal" color="error" :aria-label="t('app.orthoApneaOrder.form.additionalSplintsRemove')" @click="removeAdditionalSplint(idx)">
                  <AppIcon name="trash" />
                </AppButton>
              </div>
              <span v-if="fieldError('sequence.additionalSplints')" class="oa-wizard__field-error">{{ fieldError("sequence.additionalSplints") }}</span>
            </template>
          </div>

          <!-- Morning Aligner is a flag on this NOA / NOA TMJ order (add-on), never a second order.
               Its own photo card under "Add-ons", still in Paso 2 (NEO-225). -->
          <p class="oa-wizard__subsection mt-6 mb-2">{{ t("app.orthoApneaOrder.form.addonsTitle") }}</p>
          <AddonCard
            v-model="order.morningAligner"
            data-field="morningAligner"
            :title="t('app.orthoApneaOrder.form.morningAligner')"
            :description="t('app.orthoApneaOrder.form.morningAlignerShort')"
            :details="t('app.orthoApneaOrder.tooltip.morningAligner')"
            :image="TOOLTIP_IMG.morningAligner"
          />
          </section>

          <VDivider class="my-10" />

          <p class="text-subtitle2 mb-4 text-primary">{{ t("app.orthoApneaOrder.paso3.title") }}</p>
          <!-- NEO-225: two values only, so the same segmented switch as product / sequence type. -->
          <div data-field="verticalDimension" class="oa-wizard__stepper-col oa-wizard__center">
            <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.verticalDimension") }}</p>
            <AppSegmentedTabs
              :model-value="order.verticalDimension.kind"
              :options="verticalDimensionOptions"
              fit
              class="oa-wizard__switch"
              @update:model-value="onVerticalDimensionPicked"
            />
          </div>
          <!-- Design options as photo cards (NEO-225), like Morning Aligner. OA shows these
               with a photo only, so the cards carry no description text. -->
          <VRow class="mt-4 mb-6" dense>
            <VCol cols="12" sm="6">
              <AddonCard
                v-model="order.anteriorFrontalOpening"
                data-field="anteriorFrontalOpening"
                :title="t('app.orthoApneaOrder.form.anteriorFrontalOpening')"
                :image="TOOLTIP_IMG.anteriorFrontalOpening"
                :show-added="false"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AddonCard
                v-model="order.slotsForElasticBands"
                data-field="slotsForElasticBands"
                :title="t('app.orthoApneaOrder.form.slotsForElasticBands')"
                :image="TOOLTIP_IMG.slotsForElasticBands"
                :show-added="false"
              />
            </VCol>
          </VRow>
          <VRow class="mb-6 oa-wizard__stepper-row">
            <VCol cols="12" sm="6" data-field="laterality" class="oa-wizard__stepper-col">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.laterality") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.laterality')" :image="TOOLTIP_IMG.laterality" :image-alt="t('app.orthoApneaOrder.form.laterality')" /></p>
              <NumberStepperField v-model="order.laterality" :error="!!fieldError('laterality')" class="oa-wizard__number-stepper" />
              <span v-if="fieldError('laterality')" class="oa-wizard__field-error">{{ fieldError("laterality") }}</span>
            </VCol>
            <VCol cols="12" sm="6" data-field="limitOpening" class="oa-wizard__stepper-col">
              <p class="oa-wizard__field-label">{{ t("app.orthoApneaOrder.form.limitOpening") }}<FieldTooltip :text="t('app.orthoApneaOrder.tooltip.limitOpening')" :image="TOOLTIP_IMG.limitOpening" :image-alt="t('app.orthoApneaOrder.form.limitOpening')" /></p>
              <NumberStepperField v-model="order.limitOpening" :error="!!fieldError('limitOpening')" class="oa-wizard__number-stepper" />
              <span v-if="fieldError('limitOpening')" class="oa-wizard__field-error">{{ fieldError("limitOpening") }}</span>
            </VCol>
          </VRow>
          <div class="oa-wizard__section--centered oa-wizard__picker-groups">
            <div class="oa-wizard__picker-group">
              <p class="oa-wizard__picker-label">{{ t("app.orthoApneaOrder.form.splintDesignUpperBand") }}</p>
              <IconOptionPicker :model-value="String(order.upperBand)" :options="BAND_OPTIONS" large hide-labels @update:model-value="(v) => (order.upperBand = Number(v))" />
            </div>
            <div class="oa-wizard__picker-group">
              <p class="oa-wizard__picker-label">{{ t("app.orthoApneaOrder.form.splintDesignLowerBand") }}</p>
              <IconOptionPicker :model-value="String(order.lowerBand)" :options="BAND_OPTIONS" large hide-labels @update:model-value="(v) => (order.lowerBand = Number(v))" />
            </div>
            <div class="oa-wizard__picker-group">
              <p class="oa-wizard__picker-label">{{ t("app.orthoApneaOrder.form.finish") }}</p>
              <IconOptionPicker :model-value="order.finish" :options="finishOptions" fill large @update:model-value="onFinishPicked" />
            </div>
          </div>

          <VDivider class="my-10" />

          <p class="text-subtitle2 mb-4 text-primary">{{ t("app.orthoApneaOrder.paso4.title") }}</p>
          <div class="oa-wizard__section--centered">
            <TeethDiagram :model-value="relievedTeeth" class="mb-6" @update:model-value="setRelievedTeeth" />
          </div>
          <VTextarea v-model="order.observations" :label="t('app.orthoApneaOrder.form.observations')" variant="outlined" density="comfortable" auto-grow rows="2" />
          <AppInlineAlert type="info" class="mt-2">
            {{ t("app.orthoApneaOrder.photoUploadDeferredNotice") }}
          </AppInlineAlert>
        </div>

        <!-- Step 3 — Registro dental: sent to OA as scannerTreatment / scannerPlatform (Łukasz D2). -->
        <div v-else-if="step === 3">
          <VRadioGroup
            :model-value="order.registration.method"
            color="primary"
            data-field="registration"
            :label="t('app.orthoApneaOrder.form.registrationMethod')"
            @update:model-value="onRegistrationMethodPicked"
          >
            <VRadio value="impression" :label="t('app.orthoApneaOrder.form.impressionTraditional')" />
            <VRadio value="scanner" :label="t('app.orthoApneaOrder.form.scannerIntraoral')" />
            <VRadio value="platform" :label="t('app.deviceOrder.registration.platform')" />
          </VRadioGroup>

          <template v-if="order.registration.method !== 'impression'">
            <VSelect
              v-if="order.registration.method === 'scanner'"
              :model-value="order.registration.scannerTreatment"
              :items="scannerOptions"
              :label="t('app.orthoApneaOrder.form.scanner')"
              :error-messages="fieldError('registration.scannerTreatment')"
              data-field="registration.scannerTreatment"
              variant="outlined"
              density="comfortable"
              @update:model-value="setScanner"
            />
            <VSelect
              v-else
              :model-value="order.registration.scannerPlatform"
              :items="platformOptions"
              :label="t('app.deviceOrder.registration.platformField')"
              :error-messages="fieldError('registration.scannerPlatform')"
              data-field="registration.scannerPlatform"
              variant="outlined"
              density="comfortable"
              @update:model-value="setScanner"
            />
            <AppInlineAlert type="info">
              {{ t("app.orthoApneaOrder.fileUploadDeferredNotice") }}
            </AppInlineAlert>
          </template>
        </div>

        <!-- Review. "¿Cuándo desea el producto?" stays hidden: it defaults to OA's
             earliest date for the product (context.minDesiredDate). -->
        <div v-else-if="step === 4">
          <AppInlineAlert v-if="labOrdersDisabledMessage" type="warning" class="mb-4" data-testid="lab-orders-disabled">
            {{ labOrdersDisabledMessage }}
          </AppInlineAlert>
          <VCheckbox v-model="order.noContactDoctorForRedesign" color="primary" :label="t('app.orthoApneaOrder.form.noContactDoctorForRedesign')" />
        </div>
      </div>
      </Transition>

    <template #actions>
      <AppButton v-if="step > firstStep" icon size="x-large" variant="text" color="primary" :aria-label="t('app.orthoApneaOrder.actions.back')" @click="goBack">
        <AppIcon name="arrow-left" class="oa-wizard__nav-arrow" />
      </AppButton>
      <VSpacer />
      <AppButton variant="text" @click="onCancelClick">{{ t("app.common.cancel") }}</AppButton>
      <AppButton v-if="step < 4" icon size="x-large" variant="text" color="primary" :aria-label="t('app.orthoApneaOrder.actions.next')" @click="goNext">
        <AppIcon name="arrow-right" class="oa-wizard__nav-arrow" />
      </AppButton>
      <AppButton v-else color="primary" variant="flat" :loading="submitLoading" @click="onConfirm">
        {{ t("app.orthoApneaOrder.actions.confirm") }}
      </AppButton>
    </template>

    <template #overlays>
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
    </template>
  </AppFormDialog>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useDisplay } from "vuetify";
import {
  CONFIRMABLE_WARNINGS,
  issuesFor,
  PRODUCT_CODES,
  SCANNER_PLATFORMS,
  standardSequenceOffsets,
  startingPointMm,
  type OrderIssue,
  type ProductCode,
  type SequenceUnit,
} from "@device-order";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import IconOptionPicker, { type IconOption } from "./IconOptionPicker.vue";
import TeethDiagram from "./TeethDiagram.vue";
import DeviationDiagram from "./DeviationDiagram.vue";
import MandibularRuler from "./MandibularRuler.vue";
import FieldTooltip from "./FieldTooltip.vue";
import AddonCard from "./AddonCard.vue";
import NumberStepperField from "./NumberStepperField.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import AppFormDialog from "../AppFormDialog.vue";
import { useNotifications } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { focusFormField, type FormErrorSummaryLine } from "../../composables/useFormErrors";
import { scrollToFormTop } from "../../utils/scrollToFormTop";
import { hcoDetailLink, hcpDetailLink } from "../../utils/entityLinks";
import { PLATFORM_BRANDS, SCANNER_BRANDS, UNKNOWN_SCANNER_I18N_KEY, WIZARD_SCANNERS } from "../../utils/deviceOrderRegistration";
import {
  useOrthoApneaOrderWizard,
  stepOfPath,
  STEP_PATHS,
  WIZARD_STEPS,
  type OrthoApneaDraftPlan,
} from "../../composables/useOrthoApneaOrderWizard";
import { AppInlineAlert, AppSegmentedTabs, FormErrorSummary } from "@ui";
import { useAuthStore } from "../../stores/auth";

/**
 * The device order wizard (Envío → Datos de construcción → Registro dental →
 * Review), a replica of OrthoApnea's own form. Since CORE-95 its state is
 * the canonical DeviceOrder (@device-order) and every rule comes from that
 * package's validateDeviceOrder — the same validator the API runs — so the
 * wizard shows exactly what the API would reject, at the same field.
 *
 * - Delivery is not chosen here: the device ships to the ordering doctor's
 *   primary HCO, read from /api/v1/device-orders/context (missing data
 *   blocks step 1 and points at the record to fix).
 * - One product per order (NOA or NOA TMJ); Morning Aligner is a flag on it.
 * - Sequence: Estándar (OA's fixed SP, −1, +1, +2) or Individualizada.
 * - The desired date is hidden and defaults to OA's earliest date.
 *
 * - An advance range under 5 mm shows OA's warning plus a confirmation the
 *   doctor must tick (Łukasz D1, order.acknowledgedWarnings).
 * - Step 3's registration is part of the order: the pickers show brand names
 *   and the order carries OA's enum names (Łukasz D2). No promotion-code field.
 *
 * Still deferred (flagged inline): photo/CBCT and scan-file upload.
 */
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

const { t, te } = useI18n();
const notifications = useNotifications();
/** Shrinks the deviation diagrams on narrow viewports so the row fits without horizontal overflow. */
const { mobile } = useDisplay();
const deviationDiagramSize = computed(() => (mobile.value ? "normal" : "large"));
const router = getCurrentInstance()?.appContext.config.globalProperties.$router;

/** Brand names shown, OA's enum names sent (Łukasz D2). */
const scannerOptions = computed(() =>
  WIZARD_SCANNERS.map((name) => ({ value: name, title: SCANNER_BRANDS[name] ?? t(UNKNOWN_SCANNER_I18N_KEY) })),
);
const platformOptions = SCANNER_PLATFORMS.map((name) => ({ value: name, title: PLATFORM_BRANDS[name] }));

function onRegistrationMethodPicked(value: unknown) {
  if (value === "impression" || value === "scanner" || value === "platform") setRegistrationMethod(value);
}

/** OrthoApnea's own reference images, downloaded locally (see assets/orthoapnea/ — public static files, not behind their auth). */
function bandImg(n: number): string {
  return new URL(`../../assets/orthoapnea/splint-design/oa-band-${n}.png`, import.meta.url).href;
}
const BAND_OPTIONS: IconOption[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n), imgSrc: bandImg(n) }));

const finishOptions = computed<IconOption[]>(() => [
  { value: "mixed", label: t("app.orthoApneaOrder.form.toothNormal"), imgSrc: new URL("../../assets/orthoapnea/splint-design/mixedSplintDesign.png", import.meta.url).href },
  { value: "scalloped", label: t("app.orthoApneaOrder.form.toothRelieve"), imgSrc: new URL("../../assets/orthoapnea/splint-design/scallopedSplintDesign.png", import.meta.url).href },
]);

const verticalDimensionOptions = computed(() => [
  { label: t("app.deviceOrder.verticalDimension.minimal"), value: "minimal" },
  { label: t("app.deviceOrder.verticalDimension.registro"), value: "registro" },
]);

/** OrthoApnea's own tooltip images (see assets/orthoapnea/tooltips/ and docs/orthoapnea-wizard-fidelity.md). */
const TOOLTIP_IMG = {
  morningAligner: new URL("../../assets/orthoapnea/tooltips/morning-aligner.jpg", import.meta.url).href,
  anteriorFrontalOpening: new URL("../../assets/orthoapnea/tooltips/frontal-opening.jpeg", import.meta.url).href,
  slotsForElasticBands: new URL("../../assets/orthoapnea/tooltips/elastic-band-hooks.jpg", import.meta.url).href,
  laterality: new URL("../../assets/orthoapnea/tooltips/laterality.jpg", import.meta.url).href,
  limitOpening: new URL("../../assets/orthoapnea/tooltips/limit-opening.png", import.meta.url).href,
};

/** Each order path's field: the i18n label key; the matching prefix is also the field's data-field / error key. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  dentistId: "app.orthoApneaOrder.form.doctor",
  delivery: "app.deviceOrder.delivery.title",
  productCode: "app.orthoApneaOrder.selectProduct",
  retrusionMaxMm: "app.orthoApneaOrder.form.retrusionMax",
  protrusionMaxMm: "app.orthoApneaOrder.form.protrusionMax",
  startingPoint: "app.orthoApneaOrder.form.startingPointHeader",
  sequence: "app.orthoApneaOrder.form.sequenceType",
  "sequence.additionalSplints": "app.orthoApneaOrder.form.additionalSplints",
  deviation: "app.orthoApneaOrder.form.deviationSectionTitle",
  morningAligner: "app.orthoApneaOrder.form.morningAligner",
  verticalDimension: "app.orthoApneaOrder.form.verticalDimension",
  anteriorFrontalOpening: "app.orthoApneaOrder.form.anteriorFrontalOpening",
  slotsForElasticBands: "app.orthoApneaOrder.form.slotsForElasticBands",
  laterality: "app.orthoApneaOrder.form.laterality",
  limitOpening: "app.orthoApneaOrder.form.limitOpening",
  upperBand: "app.orthoApneaOrder.form.splintDesignUpperBand",
  lowerBand: "app.orthoApneaOrder.form.splintDesignLowerBand",
  finish: "app.orthoApneaOrder.form.finish",
  teeth: "app.orthoApneaOrder.paso4.title",
  observations: "app.orthoApneaOrder.form.observations",
  desiredDate: "app.deviceOrder.desiredDate",
  noContactDoctorForRedesign: "app.orthoApneaOrder.form.noContactDoctorForRedesign",
  registration: "app.orthoApneaOrder.form.registrationMethod",
  "registration.scannerTreatment": "app.orthoApneaOrder.form.scanner",
  "registration.scannerPlatform": "app.deviceOrder.registration.platformField",
};
const FIELD_KEYS = Object.keys(FIELD_LABELS).sort((a, b) => b.length - a.length);

/** An issue path → the field that shows it (longest matching prefix), e.g. sequence.values.1 → sequence. */
function fieldKeyOf(path: string): string {
  return FIELD_KEYS.find((k) => path === k || path.startsWith(`${k}.`)) ?? path;
}

const isDeliveryPath = (path: string) => path === "delivery" || path.startsWith("delivery.");

const authStore = useAuthStore();
/**
 * A doctor orders only as themselves, so only to their own clinic (Łukasz,
 * 2026-10-03, NEO-210): step 1 (who orders, where it ships) is skipped and
 * the remaining steps are numbered 1–3. The API enforces the same rule.
 */
const isDoctor = computed(() => authStore.user?.role === "doctor");
const firstStep = computed(() => (isDoctor.value ? 2 : 1));
/** The steps this user walks through. */
const visibleSteps = computed(() => WIZARD_STEPS.filter((n) => n >= firstStep.value));
const stepperItems = computed(() =>
  visibleSteps.value.map((n) => ({
    step: n,
    title: t(n === 4 ? "app.orthoApneaOrder.review.title" : `app.orthoApneaOrder.step${n}.title`),
  })),
);

const step = ref(1);
const maxReachedStep = ref(1);
/** Slide direction for the step transition — set right before `step` changes. */
const stepTransitionName = ref<"oa-wizard-step-slide-forward" | "oa-wizard-step-slide-back">("oa-wizard-step-slide-forward");

/** True once the order differs from how it opened — only then does closing offer "save as draft?". */
const touched = ref(false);
const showDraftPrompt = ref(false);

const {
  order,
  additionalSplintInputs,
  availableProductCodes,
  doctorOptions,
  loadingDoctors,
  context,
  contextLoading,
  contextFailed,
  deliveryOrganizationId,
  submitLoading,
  serverIssues,
  labOrdersDisabled,
  validation,
  deliveryIssues,
  setSequenceType,
  setSequenceUnit,
  setSequenceValue,
  addAdditionalSplint,
  setAdditionalSplint,
  removeAdditionalSplint,
  setProductCode,
  setStartingPoint,
  setWarningAcknowledged,
  setRegistrationMethod,
  setScanner,
  resetForOpen,
  loadProducts,
  loadDoctorsAndDefault,
  loadContext,
  confirmOrder,
  persistDraft,
} = useOrthoApneaOrderWizard(() => isDoctor.value);

watch(order, () => { touched.value = true; }, { deep: true });

// ── Product + sequence ──────────────────────────────────────────────────────

const productOptions = computed(() =>
  availableProductCodes.value.map((code) => ({
    value: code,
    label: t(code === PRODUCT_CODES.NOA ? "app.deviceOrder.product.noa" : "app.deviceOrder.product.noaTmj"),
  })),
);

function onProductPicked(value: string) {
  const code = availableProductCodes.value.find((c): c is ProductCode => c === value);
  if (code) setProductCode(code);
}

const sequenceTypeOptions = computed(() => [
  { value: "standard", label: t("app.orthoApneaOrder.form.sequenceTypeStandard") },
  { value: "personalized", label: t("app.orthoApneaOrder.form.sequenceTypePersonalized") },
]);

function onSequenceTypePicked(value: string) {
  if (value === "standard" || value === "personalized") setSequenceType(value);
}

function onSequenceUnitPicked(value: unknown) {
  if (value === "mm" || value === "%") setSequenceUnit(value);
}

/** The personalized sequence, or null on Estándar — narrows the union for the template. */
const personalized = computed(() => (order.sequence.type === "personalized" ? order.sequence : null));
const standardOffsets = computed(() => standardSequenceOffsets(order.productCode).map(String));
const sequenceHint = computed(() =>
  t(order.productCode === PRODUCT_CODES.NOA ? "app.orthoApneaOrder.form.sequenceTypeHint" : "app.deviceOrder.sequence.hintTmj"),
);

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Starting point ──────────────────────────────────────────────────────────

/** The value shown in the % or mm input: only the one the doctor filled. */
function spInput(unit: SequenceUnit): number | null {
  return order.startingPoint.unit === unit ? order.startingPoint.value : null;
}

/** The other input is locked while one holds a value (OA: mutually disabled). */
function spLocked(unit: SequenceUnit): boolean {
  return order.startingPoint.unit !== unit && order.startingPoint.value !== null;
}

const spMm = computed(() => startingPointMm(order));
const spHint = computed(() =>
  order.startingPoint.unit === "%" && spMm.value !== null ? t("app.deviceOrder.startingPointMmHint", { mm: spMm.value }) : null,
);

const mandibularRange = computed(() => order.protrusionMaxMm - order.retrusionMaxMm);

// ── Paso 3 / Paso 4 pickers ─────────────────────────────────────────────────

function onVerticalDimensionPicked(value: unknown) {
  order.verticalDimension = value === "minimal" ? { kind: "minimal" } : { kind: "registro" };
}

function onFinishPicked(value: string) {
  if (value === "mixed" || value === "scalloped") order.finish = value;
}

/** The teeth picker only knows "relieve" for now; other tooth states can come later. */
const relievedTeeth = computed(() => Object.keys(order.teeth).filter((tooth) => order.teeth[tooth] === "relieve"));

function setRelievedTeeth(teeth: string[]) {
  const next: typeof order.teeth = {};
  for (const [tooth, state] of Object.entries(order.teeth)) if (state !== "relieve") next[tooth] = state;
  for (const tooth of teeth) next[tooth] = "relieve";
  order.teeth = next;
}

// ── Delivery (step 1) ───────────────────────────────────────────────────────

let contextKey: string | null = null;
/** (Re)loads the doctor's HCO and OA's earliest date — only when the doctor or product actually changed, unless forced. */
function refreshContext(force = false) {
  // A doctor's context is always their own; the dentistId the API hands back must not trigger a reload.
  const key = `${isDoctor.value ? "self" : order.dentistId}|${order.productCode}|${deliveryOrganizationId.value ?? ""}`;
  if (!force && key === contextKey) return;
  contextKey = key;
  void loadContext();
}

function onDoctorPicked(value: unknown) {
  // Another doctor has other clinics: back to their primary.
  if (value !== order.dentistId) deliveryOrganizationId.value = null;
  order.dentistId = typeof value === "string" ? value : "";
}

/** The doctor's clinics as an admin's choice (the API sends them to an admin only), primary marked. */
const clinicItems = computed(() =>
  (context.value?.deliveryOptions ?? []).map((o) => ({
    value: o.organizationId,
    title: [o.name, o.city].filter(Boolean).join(" · ") + (o.isPrimary ? ` (${t("app.deviceOrder.delivery.primary")})` : ""),
  })),
);
const selectedClinicId = computed(
  () => deliveryOrganizationId.value ?? context.value?.delivery?.organizationId ?? context.value?.deliveryOptions.find((o) => o.isPrimary)?.organizationId ?? null,
);
function onClinicPicked(value: unknown) {
  const primaryId = context.value?.deliveryOptions.find((o) => o.isPrimary)?.organizationId;
  // Picking the primary again is the default, not a choice.
  deliveryOrganizationId.value = typeof value === "string" && value !== primaryId ? value : null;
}

watch(() => [order.dentistId, order.productCode, deliveryOrganizationId.value], () => {
  if (!props.modelValue) return;
  // A rejected delivery belonged to the previous doctor's (or clinic's) HCO.
  serverIssues.value = serverIssues.value.filter((i) => !isDeliveryPath(i.path));
  refreshContext();
});

/**
 * NEO-210: the tenant's kill switch. Known ahead of time from the context
 * call (`context.sendEnabled`) so the doctor sees it before filling anything;
 * `labOrdersDisabled` covers it turning off mid-session (the 409 on Confirm).
 * Never names the lab.
 */
const labOrdersDisabledMessage = computed(() =>
  labOrdersDisabled.value || context.value?.sendEnabled === false ? t("app.orthoApneaOrder.labOrdersDisabled") : undefined,
);

const deliveryMessage = computed(() => {
  const issues = deliveryIssues.value;
  if (issues.length === 0) return undefined;
  if (contextFailed.value) return t("app.deviceOrder.delivery.loadFailed");
  if (issues.some((i) => i.path === "delivery")) return t("app.deviceOrder.delivery.noClinic");
  const fields = [...new Set(issues.map((i) => i.path.slice("delivery.".length)))].map((f) =>
    te(`app.deviceOrder.delivery.field.${f}`) ? t(`app.deviceOrder.delivery.field.${f}`) : f,
  );
  return t("app.deviceOrder.delivery.incomplete", { fields: fields.join(", ") });
});

/**
 * The same problem, worded for the doctor themselves: it is their clinic's
 * address, and they can't fix it here — they contact NeoSleep (Łukasz,
 * 2026-10-03, NEO-210; a link to open a support ticket comes later).
 */
const doctorDeliveryMessage = computed(() => {
  const issues = deliveryIssues.value;
  if (issues.length === 0) return undefined;
  if (contextFailed.value) return t("app.deviceOrder.delivery.loadFailed");
  if (issues.some((i) => i.path === "delivery")) return t("app.deviceOrder.delivery.doctorNoClinic");
  const fields = [...new Set(issues.map((i) => i.path.slice("delivery.".length)))].map((f) =>
    te(`app.deviceOrder.delivery.field.${f}`) ? t(`app.deviceOrder.delivery.field.${f}`) : f,
  );
  const clinic = context.value?.delivery?.name?.trim();
  return clinic
    ? t("app.deviceOrder.delivery.doctorIncompleteNamed", { clinic, fields: fields.join(", ") })
    : t("app.deviceOrder.delivery.doctorIncomplete", { fields: fields.join(", ") });
});

/** Where to fix the address: the HCO itself when the API names it, else the doctor's record (where the primary HCO is set). */
const recordHref = computed(() => {
  const link = hcoDetailLink(context.value?.delivery?.organizationId) ?? hcpDetailLink(order.dentistId);
  return link && router ? router.resolve(link).href : null;
});

// ── Errors (NEO-109): the shared validator per step, plus what the API returned ──

const attemptedSteps = reactive(new Set<number>());
/** MR/MP errors show live once either was edited, as before — the rest waits for Next. */
const mrMpTouched = ref(false);
watch(() => [order.retrusionMaxMm, order.protrusionMaxMm], () => { mrMpTouched.value = true; });

function sameIssue(a: OrderIssue, b: OrderIssue): boolean {
  return a.path === b.path && a.code === b.code;
}

/** The shared validator's errors for step n's own paths, plus the API's for them. */
function errorsOfStep(n: number): OrderIssue[] {
  const paths = STEP_PATHS[n] ?? [];
  const server = serverIssues.value.filter((i) => !isDeliveryPath(i.path) && stepOfPath(i.path) === n);
  const local = issuesFor(validation.value.errors, paths).filter((i) => !server.some((s) => sameIssue(s, i)));
  return [...server, ...local];
}

/**
 * Everything blocking step n. The first step this user sees also carries the
 * delivery check and any skipped step's errors (a doctor has no step 1, so
 * their doctor/clinic problems show on step 2).
 */
function stepErrors(n: number): OrderIssue[] {
  if (n < firstStep.value) return [];
  if (n !== firstStep.value) return errorsOfStep(n);
  return [...WIZARD_STEPS.filter((m) => m <= n).flatMap(errorsOfStep), ...deliveryIssues.value];
}

function stepBlocked(n: number): boolean {
  const loadingDelivery = n === firstStep.value && (isDoctor.value || !!order.dentistId) && contextLoading.value;
  return stepErrors(n).length > 0 || loadingDelivery;
}

/** The step that shows an issue: its own, never one this user skips. */
function visibleStepOf(path: string): number | undefined {
  const own = isDeliveryPath(path) ? 1 : stepOfPath(path);
  return own === undefined ? undefined : Math.max(own, firstStep.value);
}

/** Errors shown on the current step: all of them after an attempt, otherwise only the live MR/MP check. */
const visibleErrors = computed<OrderIssue[]>(() => {
  const all = stepErrors(step.value);
  if (attemptedSteps.has(step.value)) return all;
  return mrMpTouched.value ? all.filter((i) => ["retrusionMaxMm", "protrusionMaxMm"].includes(fieldKeyOf(i.path))) : [];
});

function issueMessage(issue: OrderIssue): string {
  const params = issue.params ?? {};
  if (issue.code === "outOfRange") {
    const variant = params.min !== undefined && params.max !== undefined ? "outOfRange" : params.min !== undefined ? "outOfRangeMin" : "outOfRangeMax";
    return t(`app.deviceOrder.errors.${variant}`, params);
  }
  return t(`app.deviceOrder.errors.${issue.code}`, params);
}

function messageFor(issue: OrderIssue): string {
  return isDeliveryPath(issue.path) ? ((isDoctor.value ? doctorDeliveryMessage.value : deliveryMessage.value) ?? issueMessage(issue)) : issueMessage(issue);
}

/** The message under a field — its first visible error. */
function fieldError(key: string): string | undefined {
  const issue = visibleErrors.value.find((i) => fieldKeyOf(i.path) === key);
  return issue ? messageFor(issue) : undefined;
}

function hasIssueAt(path: string): boolean {
  return visibleErrors.value.some((i) => i.path === path);
}

/** The summary's lines: one per field, in step order — empty until that step's first attempt. */
const errorList = computed<FormErrorSummaryLine[]>(() => {
  if (!attemptedSteps.has(step.value)) return [];
  const lines: FormErrorSummaryLine[] = [];
  for (const issue of visibleErrors.value) {
    const key = fieldKeyOf(issue.path);
    if (lines.some((l) => l.key === key)) continue;
    const label = FIELD_LABELS[key];
    lines.push({ key, label: label ? t(label) : undefined, message: messageFor(issue) });
  }
  return lines;
});

const isMrMpPath = (path: string) => ["retrusionMaxMm", "protrusionMaxMm"].includes(fieldKeyOf(path));

/** The MR/MP error alert — an unconfirmed warning is shown on its checkbox instead, under the warning. */
const mrMpError = computed(() => {
  const issue = visibleErrors.value.find((i) => isMrMpPath(i.path) && i.code !== "warningNotConfirmed");
  return issue ? messageFor(issue) : undefined;
});

/**
 * OA only warns when the advance is under 5 mm (its server accepted 3 mm); a
 * confirmable warning also asks the doctor to confirm it (Łukasz D1).
 */
const mrMpWarning = computed(() => {
  const warning = validation.value.warnings.find((w) => isMrMpPath(w.path));
  if (!warning) return undefined;
  const confirmable = CONFIRMABLE_WARNINGS.some((code) => code === warning.code);
  return { code: warning.code, message: issueMessage(warning), confirmable };
});

/** Red on the confirmation once the doctor tried to leave the step without it. */
const mrMpConfirmError = computed(() => {
  if (!attemptedSteps.has(step.value)) return undefined;
  const issue = visibleErrors.value.find((i) => isMrMpPath(i.path) && i.code === "warningNotConfirmed");
  return issue ? issueMessage(issue) : undefined;
});

function onWarningConfirmed(value: boolean | null) {
  if (mrMpWarning.value) setWarningAcknowledged(mrMpWarning.value.code, value === true);
}

/** The value an issue path points at in the order — an API error goes once that value is edited. */
function valueAt(path: string): string {
  let node: unknown = order;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return "undefined";
    node = (node as Record<string, unknown>)[part];
  }
  return JSON.stringify(node) ?? "undefined";
}

let serverSnapshot = new Map<string, string>();
function snapshotServerIssues() {
  serverSnapshot = new Map(serverIssues.value.filter((i) => !isDeliveryPath(i.path)).map((i) => [i.path, valueAt(i.path)]));
}
watch(order, () => {
  if (serverIssues.value.length === 0) return;
  const kept = serverIssues.value.filter((i) => isDeliveryPath(i.path) || serverSnapshot.get(i.path) === valueAt(i.path));
  if (kept.length !== serverIssues.value.length) serverIssues.value = kept;
}, { deep: true });

const stepEl = ref<HTMLElement | null>(null);

/** The summary's links jump to their field. */
function focusField(key: string) {
  focusFormField(stepEl.value?.querySelector(`[data-field="${key}"]`));
}

function moveTo(target: number) {
  stepTransitionName.value = target >= step.value ? "oa-wizard-step-slide-forward" : "oa-wizard-step-slide-back";
  step.value = target;
  if (target > maxReachedStep.value) maxReachedStep.value = target;
}

/** Shows a step's errors (moving there first) and scrolls up to its summary. */
function showStepErrors(n: number) {
  if (n !== step.value) moveTo(n);
  attemptedSteps.add(n);
  nextTick(() => scrollToFormTop(stepEl.value));
}

/** Opens the first step holding an issue the API returned. False when none is on the wizard. */
function showServerIssues(): boolean {
  const target = visibleSteps.value.find((n) => serverIssues.value.some((i) => visibleStepOf(i.path) === n));
  if (target === undefined) return false;
  snapshotServerIssues();
  showStepErrors(target);
  return true;
}

function goNext() {
  if (stepBlocked(step.value)) {
    showStepErrors(step.value);
    return;
  }
  moveTo(step.value + 1);
}

function goBack() {
  moveTo(step.value - 1);
}

/** Only steps already reached are clickable; jumping forward still stops at the first step with something to fix. */
function goToStep(target: number) {
  if (target > maxReachedStep.value) return;
  const blocking = target > step.value ? visibleSteps.value.find((n) => n >= step.value && n < target && stepBlocked(n)) : undefined;
  if (blocking !== undefined) showStepErrors(blocking);
  else moveTo(target);
}

async function onConfirm() {
  // A step passed earlier can have been broken since — reopen the first one to fix.
  const invalid = visibleSteps.value.find((n) => stepBlocked(n));
  if (invalid !== undefined) {
    showStepErrors(invalid);
    return;
  }
  const shouldClose = await confirmOrder(props.patientId, props.sleepStudyId);
  if (shouldClose) {
    emit("submitted");
    emit("update:modelValue", false);
  } else if (serverIssues.value.length > 0) {
    showServerIssues();
  }
}

function closeImmediately() {
  showDraftPrompt.value = false;
  emit("update:modelValue", false);
}

/** X button / Cancel — prompts to save a draft only if something actually changed since opening. */
function requestClose() {
  if (touched.value) showDraftPrompt.value = true;
  else closeImmediately();
}

function discardDraft() {
  closeImmediately();
}

const { loading: savingDraft, run: saveDraftAndClose } = useAsyncAction(async () => {
  const ok = await persistDraft(props.patientId, props.sleepStudyId);
  if (ok) {
    notifications.show(t("app.orthoApneaOrder.draftSaved"), "success", undefined, { icon: "nav-treatment-plans" });
    emit("submitted"); // refresh the panel's list so the new/updated draft shows up
    closeImmediately();
  } else if (serverIssues.value.length > 0 && showServerIssues()) {
    // The rep fixes the marked field in the wizard instead of reading a toast (NEO-109).
    showDraftPrompt.value = false;
  } else {
    notifications.show(t("app.orthoApneaOrder.error"), "error", undefined, { icon: "nav-treatment-plans" });
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
    if (!open) return;
    resetForOpen(props.draftPlan);
    step.value = firstStep.value;
    maxReachedStep.value = firstStep.value;
    showDraftPrompt.value = false;
    attemptedSteps.clear();
    contextKey = null;
    refreshContext(true);
    void loadProducts();
    void loadDoctorsAndDefault(props.patientId);

    // After resetForOpen()'s own assignments have triggered the watchers once —
    // so opening (or resuming a draft) doesn't count as an edit.
    nextTick(() => {
      touched.value = false;
      mrMpTouched.value = false;
    });
  },
);
</script>

<style scoped>
/* Transparent so the stepper sits on the dialog's own surface (AppFormDialog)
   instead of painting a separate surface band. */
.oa-wizard__stepper {
  box-shadow: none;
  background: transparent;
}

/* Phone (NEO-232): four titles don't fit, and Vuetify then scrolls the header
   sideways. Only the current step keeps its title; the others are their
   numbered circle, so every step is on screen and the current one reads in full. */
@media (max-width: 599px) {
  .oa-wizard__stepper :deep(.v-stepper-header) {
    overflow-x: visible;
    padding-inline: 16px;
  }
  .oa-wizard__stepper :deep(.v-stepper-item) {
    flex: none;
    padding-inline: 8px;
  }
  .oa-wizard__stepper :deep(.v-stepper-item:not(.v-stepper-item--selected) .v-stepper-item__content) {
    display: none;
  }
  /* A long title ("Configuración del tratamiento") wraps onto a second line
     instead of pushing step 4 off screen; it never shrinks below its longest word. */
  .oa-wizard__stepper :deep(.v-stepper-item--selected) {
    flex: 0 1 auto;
  }
  .oa-wizard__stepper :deep(.v-stepper-item--selected .v-stepper-item__title) {
    white-space: normal;
    line-height: 1.25;
  }
  /* The connectors take what's left, so they shrink before any title does. */
  .oa-wizard__stepper :deep(.v-stepper-header > .v-divider) {
    flex: 1 1 0;
    min-width: 12px;
    margin-inline: 0;
  }
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

/* NEO-225: Paso 2 sizes itself by the dialog, not the viewport (a tablet
   dialog can be narrower than a desktop one). Narrow (< 600 px): steppers
   centred above a full-width ruler, % and mm side by side when they fit, the
   rest of the section centred too. Wide: ruler 7 / steppers 5. */
.oa-wizard__paso2 {
  container-type: inline-size;
}

.oa-wizard__sp-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.oa-wizard__sp-ruler {
  order: 2;
}

.oa-wizard__sp-fields {
  order: 1;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 24px;
}

/* Fixed height, so a hint or error appearing never moves what is below. */
.oa-wizard__sp-message {
  flex-basis: 100%;
  min-height: 18px;
  text-align: center;
}

.oa-wizard__sp-message .oa-wizard__field-error {
  margin-top: 0;
}

@container (min-width: 600px) {
  .oa-wizard__sp-body {
    grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
    align-items: center;
    gap: 24px;
  }

  .oa-wizard__sp-ruler {
    order: 1;
  }

  .oa-wizard__sp-fields {
    order: 2;
    flex-direction: column;
    align-items: center;
    flex-wrap: nowrap;
  }
}

@container (max-width: 599px) {
  .oa-wizard__paso2 > .text-subtitle2,
  .oa-wizard__sp-header,
  .oa-wizard__paso2 [data-testid="sequence"] > .d-flex {
    justify-content: center;
    text-align: center;
  }

  .oa-wizard__paso2 .oa-wizard__switch {
    margin-inline: auto;
  }

  .oa-wizard__paso2 .oa-wizard__seq-row {
    justify-content: center;
  }
}

.oa-wizard__subsection {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.oa-wizard__subsection::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(var(--v-theme-on-surface), 0.12);
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

/* One stepper size for SP, Lateralidad and Limitación de apertura (NEO-225):
   −/+ and a box wide enough for "-3", and it fits a 320 px phone. Not
   .oa-wizard__stepper: that is the step header, which this squeezed to
   180 px and cut off after step 2 (NEO-232). */
.oa-wizard__sp-field-input,
.oa-wizard__number-stepper {
  width: 180px;
  max-width: 100%;
}

/* Phone: one stepper per row, label and stepper centred like Paso 2. */
@media (max-width: 599px) {
  .oa-wizard__stepper-col {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .oa-wizard__stepper-col .oa-wizard__field-label {
    justify-content: center;
  }
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
  /* overflow-x alone computes overflow-y to auto, which let the teeth
     diagram scroll up/down inside the form (NEO-229). */
  overflow-y: hidden;
}

/* NEO-229 D1: fields sit on the form's centre axis at every width (Paso
   titles and the COMPLEMENTOS label stay left). Paso 2 reuses the rules its
   narrow container query already had; the SP ruler keeps its 7/5 split. */
.oa-wizard__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.oa-wizard__center .oa-wizard__field-label,
.oa-wizard__sp-header,
.oa-wizard__paso2 [data-testid="sequence"] > .d-flex {
  justify-content: center;
  text-align: center;
}

.oa-wizard__center .oa-wizard__switch,
.oa-wizard__paso2 .oa-wizard__switch {
  margin-inline: auto;
}

.oa-wizard__paso2 .oa-wizard__seq-row {
  justify-content: center;
}

/* NEO-229: Lateralidad / Limitación de apertura centred in their half, like
   the band pickers and teeth diagram below them (phone already centres). */
.oa-wizard__stepper-row .oa-wizard__stepper-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.oa-wizard__stepper-row .oa-wizard__field-label {
  justify-content: center;
}

/* NEO-229: each picker's label sits centred over its own tile row instead of
   at the section's left edge, 24 px between groups. */
.oa-wizard__picker-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding-bottom: 8px;
}

.oa-wizard__picker-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.oa-wizard__picker-group > :last-child {
  width: 100%;
}

.oa-wizard__picker-label {
  font-size: 0.8125rem;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  margin: 0;
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

/* Product and sequence-type switches: the same segmented control (and width)
   as Paso 4's Normal/Aliviar switch (TeethDiagram). */
.oa-wizard__switch {
  /* fit: each option is as wide as its label, so "Individualizada" is never cut (NEO-213). */
  max-width: 100%;
}

.oa-wizard__ship-to {
  margin-top: 8px;
}

.oa-wizard__address {
  font-style: normal;
  line-height: 1.5;
  padding: 12px 14px;
  border-radius: var(--pwa-radius);
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.oa-wizard__alert-link {
  margin-left: 4px;
  color: inherit;
  font-weight: 600;
}

/* SP + splint boxes, OA's grey read-only cells (standard) or inputs (personalized). */
.oa-wizard__seq-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.oa-wizard__seq-unit {
  font-size: 0.8125rem;
  min-width: 32px;
}

.oa-wizard__seq-cell {
  display: inline-flex;
  align-items: center;
  min-width: 64px;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--pwa-radius);
  background: rgba(var(--v-theme-on-surface), 0.08);
  font-size: 0.9375rem;
}

.oa-wizard__seq-input {
  flex: 0 0 80px;
}

.oa-wizard__seq-units {
  flex: 0 0 auto;
}

.oa-wizard__field-error {
  display: block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: rgb(var(--v-theme-error));
}
</style>
