import { reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";

/**
 * Extracted from OrthoApneaOrderWizard.vue: everything that does an apiFetch
 * call or pure payload-building, so it's unit-testable without mounting the
 * full ~1000-line component. The reactive `form`/`sequence` state moved here
 * too (rather than staying in the component) since every function below
 * reads or mutates it directly — splitting the state from the logic that
 * owns it would just mean passing form/sequence as parameters everywhere.
 *
 * Left in the component (see its own header comment): step navigation
 * (step/maxReachedStep/goNext/goToStep), canAdvance/step1Valid validation,
 * the morningAligner <-> products sync watchers, and all template/UI-only
 * computed values (sortedProductOptions, selectedProductIds, mandibularRange,
 * productChipColor/productSortRank) — none of those call the API or build a
 * payload, they're pure template-rendering concerns over the state this
 * composable exposes.
 */

export interface OrthoApneaProduct {
  id: number;
  code: string;
  nameEs: string;
  category: string;
}

/** A treatment_plan row saved as a draft (metadata.orthoapneaDraft set, never sent to OrthoApnea — see PatientOrthoApneaPanel's isDraft()). */
export interface OrthoApneaDraftPlan {
  id: string;
  metadata: Record<string, unknown> | null;
}

export interface OrthoApneaWizardSequence {
  seq1: number;
  seq2: number;
  seq3: number;
}

function defaultForm() {
  return {
    doctorId: null as string | null,
    addressSend: "clinic" as "clinic" | "alternative",
    altCountryId: null as number | null,
    altPostalCode: "",
    altCity: "",
    altAddress: "",
    altName: "",
    altEmail: "",
    altPhone: "",
    products: [] as OrthoApneaProduct[],
    date: null as string | null,
    retrusionMax: 0,
    protrusionMax: 0,
    deviationRight: 0,
    deviationLeft: 0,
    deviationAdvanceRight: 0,
    deviationAdvanceLeft: 0,
    startingPointPorcentage: null as number | null,
    startingPoint: null as number | null,
    sequenceTypeStandard: false,
    sequenceTypePersonalized: true,
    sequenceUnitInMM: false,
    morningAligner: false,
    verticalDimension: null as string | null,
    anteriorFrontalOpening: false,
    slotsForElasticBands: false,
    laterality: null as number | null,
    limitOpening: null as number | null,
    upperBandSplintDesign: null as string | null,
    lowerBandSplintDesign: null as string | null,
    finish: "mixedSplintDesign" as string | null,
    additionalSplints: [] as string[],
    teethStatus: [] as string[],
    observations: "",
    registrationMethod: "impression" as "impression" | "scanner",
    scanner: null as string | null,
    promotionCode: "",
    noContactDoctorForRedesign: false,
  };
}

export type OrthoApneaWizardForm = ReturnType<typeof defaultForm>;

const DEFAULT_SEQUENCE: OrthoApneaWizardSequence = { seq1: 60, seq2: 70, seq3: 80 };

export function useOrthoApneaOrderWizard() {
  const { t } = useI18n();
  const notifications = useNotifications();

  const form = reactive(defaultForm());
  const sequence = reactive<OrthoApneaWizardSequence>({ ...DEFAULT_SEQUENCE });

  const products = ref<OrthoApneaProduct[]>([]);
  const loadingProducts = ref(false);
  const doctorOptions = ref<{ title: string; value: string }[]>([]);
  const loadingDoctors = ref(false);
  const countryOptions = ref<{ title: string; value: number }[]>([]);
  const loadingCountries = ref(false);
  /** The patient's own region (e.g. "PL"/"MX") — used to default the
   * alternative-address phone field's area code to the PATIENT's country,
   * not the logged-in rep's (see PhoneField's defaultCountryCode prop). */
  const patientRegion = ref<string | null>(null);
  /** The shared OA account maps to exactly one "clinic" — not user-facing (see the wizard's own "Médico vs. clinic" note); resolved once and reused. */
  const internalClinicId = ref<number | null>(null);
  /** The treatment_plan id this session is drafting into — see persistDraft()/confirmOrder(). */
  const currentDraftPlanId = ref<string | null>(null);
  const submitLoading = ref(false);

  /** "¿Cuándo desea el producto?" — hidden per product decision (not shown
   * anywhere in the wizard UI), but still computed and sent as `desiredDate`:
   * the captured real order (id 452434) had requestDate 2026-09-06 and
   * expectedDeliveryDate 2026-09-21 — exactly +15 days — confirming OrthoApnea's
   * own default, which this reproduces without asking the rep to fill it in. */
  function setDefaultDesiredDate() {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    form.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /**
   * Resets form/sequence back to defaults, then applies a resumed draft's
   * snapshot (if any) on top — called by the component's open-watcher every
   * time the wizard dialog opens.
   */
  function resetForOpen(draftPlan: OrthoApneaDraftPlan | null | undefined) {
    const draft = draftPlan?.metadata?.orthoapneaDraft as
      | (Record<string, unknown> & { sequence?: OrthoApneaWizardSequence })
      | undefined;
    currentDraftPlanId.value = draftPlan?.id ?? null;

    Object.assign(form, defaultForm());
    Object.assign(sequence, DEFAULT_SEQUENCE);

    if (draft) {
      Object.assign(form, draft);
      if (draft.sequence) Object.assign(sequence, draft.sequence);
    } else {
      setDefaultDesiredDate();
    }
  }

  async function loadProducts() {
    loadingProducts.value = true;
    try {
      const res = await apiFetch("/api/v1/partners/orthoapnea/products", { handleErrors: false });
      if (res.ok) {
        const data = (await res.json()) as { items: OrthoApneaProduct[] };
        products.value = data.items;
        if (form.products.length === 0) {
          const noa = products.value.find((p) => p.nameEs.toUpperCase() === "NOA");
          if (noa) form.products = [noa];
        }
      }
    } finally {
      loadingProducts.value = false;
    }
  }

  /** Silent — the shared OA account only ever has one clinic; nothing to ask the user. */
  async function loadClinic() {
    try {
      const res = await apiFetch("/api/v1/partners/orthoapnea/clinics", { handleErrors: false });
      if (res.ok) {
        const data = (await res.json()) as { items: { id: number; name: string }[] };
        internalClinicId.value = data.items[0]?.id ?? null;
      }
    } catch {
      // leave internalClinicId null — createOrthoApneaTreatment on the backend will surface the real error
    }
  }

  /** Default: the patient's own assigned HCP (patient.practitioner_id) — that's
   * the "doctor this order is for" in our own data model. Falls back to
   * "Lorena" (the OrthoApnea account holder) only when the patient has no
   * assigned HCP at all — see the wizard component's own header comment for
   * why this reads from OUR practitioner list, not OA's "clinic" field. */
  async function loadDoctorsAndDefault(patientId: string) {
    loadingDoctors.value = true;
    try {
      const [doctorsRes, patientRes] = await Promise.all([
        apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false }),
        apiFetch(`/api/v1/patient/${patientId}`, { handleErrors: false }),
      ]);

      if (doctorsRes.ok) {
        const data = (await doctorsRes.json()) as { items: { id: string; name: string }[] };
        doctorOptions.value = data.items.map((p) => ({ title: p.name, value: p.id }));
      }

      let patientPractitionerId: string | null = null;
      if (patientRes.ok) {
        const patient = (await patientRes.json()) as { practitioner_id: string | null; region?: string | null };
        patientPractitionerId = patient.practitioner_id;
        patientRegion.value = patient.region || null;
      }

      if (patientPractitionerId && doctorOptions.value.some((d) => d.value === patientPractitionerId)) {
        form.doctorId = patientPractitionerId;
      } else {
        form.doctorId = doctorOptions.value.find((d) => d.title.toUpperCase().includes("LORENA"))?.value ?? null;
      }
    } finally {
      loadingDoctors.value = false;
    }
  }

  async function loadCountries() {
    loadingCountries.value = true;
    try {
      const res = await apiFetch("/api/v1/partners/orthoapnea/countries", { handleErrors: false });
      if (res.ok) {
        const data = (await res.json()) as { items: { id: number; es: string }[] };
        countryOptions.value = data.items.map((c) => ({ title: c.es, value: c.id }));
      }
    } finally {
      loadingCountries.value = false;
    }
  }

  /**
   * One order per selected product — the confirmed real order DTO has a
   * single `product: {id}` object, not an array, and the backend guards
   * against a second create call for the same treatment_plan (see
   * createOrthoApneaTreatment's duplicate-submission check), so a genuine
   * multi-product order becomes N local treatment_plan rows + N OrthoApnea
   * orders rather than guessing an unconfirmed array-of-products shape.
   */
  function buildWizardPayload(product: OrthoApneaProduct): Record<string, unknown> {
    return {
      clinic: internalClinicId.value,
      addressSend: form.addressSend,
      deliveryAddress: form.addressSend === "alternative"
        ? {
            country: form.altCountryId,
            postalCode: form.altPostalCode || undefined,
            city: form.altCity || undefined,
            address: form.altAddress || undefined,
            name: form.altName || undefined,
            email: form.altEmail || undefined,
            phone: form.altPhone || undefined,
          }
        : null,
      product: { id: product.id },
      retrusionMax: form.retrusionMax,
      protrusionMax: form.protrusionMax,
      deviationRight: form.deviationRight,
      deviationLeft: form.deviationLeft,
      deviationAdvanceRight: form.deviationAdvanceRight,
      deviationAdvanceLeft: form.deviationAdvanceLeft,
      startingPointPorcentage: form.startingPointPorcentage,
      startingPoint: form.startingPoint,
      sequenceTypeStandard: form.sequenceTypeStandard,
      sequenceTypePersonalized: form.sequenceTypePersonalized,
      sequenceUnitInMM: form.sequenceUnitInMM,
      sequence: form.sequenceTypePersonalized ? { ...sequence } : null,
      morningAligner: form.morningAligner,
      verticalDimension: form.verticalDimension ?? undefined,
      anteriorFrontalOpening: form.anteriorFrontalOpening,
      slotsForElasticBands: form.slotsForElasticBands,
      laterality: form.laterality ?? undefined,
      limitOpening: form.limitOpening ?? undefined,
      upperBandSplintDesign: form.upperBandSplintDesign ?? undefined,
      lowerBandSplintDesign: form.lowerBandSplintDesign ?? undefined,
      mixedSplintDesign: form.finish === "mixedSplintDesign",
      scallopedSplintDesign: form.finish === "scallopedSplintDesign",
      // Best-effort field name — OrthoApnea's own raw request body for this
      // dynamic list was never captured (see the consolidated live-capture
      // round in the project plan); flagged here rather than silently guessed.
      additionalSplints: form.additionalSplints.filter((s) => s.trim()).length > 0 ? form.additionalSplints.filter((s) => s.trim()) : undefined,
      teethStatus: form.teethStatus.length > 0 ? form.teethStatus : undefined,
      observations: form.observations || undefined,
      desiredDate: form.date,
      promotionCode: form.promotionCode || undefined,
      noContactDoctorForRedesign: form.noContactDoctorForRedesign,
    };
  }

  /**
   * Serializes the current form (plus the separate `sequence` reactive) into
   * treatment_plan.metadata.orthoapneaDraft — creating the plan (POST) the
   * first time, PATCHing it on every subsequent save. This is the entire
   * "draft" mechanism: a treatment_plan row with no partner_link yet IS the
   * "not sent to OrthoApnea" marker (see PatientOrthoApneaPanel's isDraft()),
   * no separate draft table needed. Pure I/O — no notifications/UI side
   * effects here, those stay in the component (see saveDraftAndClose).
   */
  async function persistDraft(patientId: string, sleepStudyId: string): Promise<boolean> {
    const snapshot = { ...JSON.parse(JSON.stringify(form)), sequence: { ...sequence } };
    const metadata = { orthoapneaDraft: snapshot };

    if (currentDraftPlanId.value) {
      const res = await apiFetch(`/api/v1/treatment-plan/${currentDraftPlanId.value}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata, dentist_id: form.doctorId ?? undefined }),
        handleErrors: false,
      });
      return res.ok;
    }

    const res = await apiFetch("/api/v1/treatment-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patientId,
        sleep_study_id: sleepStudyId,
        type: "dental_appliance",
        dentist_id: form.doctorId ?? undefined,
        metadata,
      }),
      handleErrors: false,
    });
    if (res.ok) {
      const plan = (await res.json()) as { id: string };
      currentDraftPlanId.value = plan.id;
    }
    return res.ok;
  }

  /**
   * The full order-submission flow: ensure the OrthoApnea-side patient
   * exists, then create one local treatment_plan + one OrthoApnea order per
   * selected product. Owns its own `submitLoading` (guards re-entrant
   * clicks) rather than being wrapped by the component's useAsyncAction, so
   * this whole flow — including the success/partial-failure/failure
   * notification choice — is testable as one unit. Returns whether the
   * caller should close the dialog and emit "submitted": true on any
   * completed attempt (even partial failure — some orders may have gone
   * through), false only when the flow never really started (no products
   * selected, or the initial "ensure patient" call itself threw).
   */
  async function confirmOrder(patientId: string, sleepStudyId: string): Promise<boolean> {
    if (submitLoading.value) return false;
    if (form.products.length === 0) return false;

    submitLoading.value = true;
    try {
      await apiFetch(`/api/v1/partners/orthoapnea/patients/${patientId}/ensure`, { method: "POST" });

      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < form.products.length; i++) {
        const product = form.products[i]!;
        let planId: string;

        // Reusing an in-progress draft's own treatment_plan for the FIRST
        // product avoids leaving an orphaned duplicate plan behind — any
        // additional selected products still get their own new plan (see
        // buildWizardPayload()'s own comment on why one order = one plan).
        if (i === 0 && currentDraftPlanId.value) {
          const patchRes = await apiFetch(`/api/v1/treatment-plan/${currentDraftPlanId.value}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dentist_id: form.doctorId ?? undefined, metadata: {} }), // clears the draft marker
            handleErrors: false,
          });
          if (!patchRes.ok) {
            failed += 1;
            continue;
          }
          planId = currentDraftPlanId.value;
        } else {
          const planRes = await apiFetch("/api/v1/treatment-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patient_id: patientId,
              sleep_study_id: sleepStudyId,
              type: "dental_appliance",
              dentist_id: form.doctorId ?? undefined,
            }),
            handleErrors: false,
          });
          if (!planRes.ok) {
            failed += 1;
            continue;
          }
          planId = ((await planRes.json()) as { id: string }).id;
        }

        const orderRes = await apiFetch("/api/v1/partners/orthoapnea/treatments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ treatment_plan_id: planId, ...buildWizardPayload(product) }),
          handleErrors: false,
        });
        // treatment_plan already exists locally either way (source of truth preserved) —
        // a failure here only means the OrthoApnea mirror for THIS product failed.
        if (orderRes.ok) succeeded += 1;
        else failed += 1;
      }

      if (failed === 0) {
        notifications.show(t("app.orthoApneaOrder.success"), "success");
      } else if (succeeded > 0) {
        notifications.show(t("app.orthoApneaOrder.partialFailure"), "error");
      } else {
        notifications.show(t("app.orthoApneaOrder.error"), "error");
      }
      return true;
    } catch {
      notifications.show(t("app.orthoApneaOrder.error"), "error");
      return false;
    } finally {
      submitLoading.value = false;
    }
  }

  return {
    form,
    sequence,
    products,
    loadingProducts,
    doctorOptions,
    loadingDoctors,
    countryOptions,
    loadingCountries,
    patientRegion,
    internalClinicId,
    currentDraftPlanId,
    submitLoading,
    resetForOpen,
    loadProducts,
    loadClinic,
    loadDoctorsAndDefault,
    loadCountries,
    buildWizardPayload,
    persistDraft,
    confirmOrder,
  };
}
