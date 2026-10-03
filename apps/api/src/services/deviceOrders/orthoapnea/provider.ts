import type { ProductCode } from "@neo/device-order";
import { PartnerServiceError } from "../../../errors.js";
import { withTenant } from "../../../db/tenant.js";
import { getPatientById } from "../../../db/patient.js";
import {
  createOrthoApneaTreatment,
  ensureOrthoApneaPatient,
  fetchCountries,
  fetchOrthoApneaClinics,
  fetchOrthoApneaCurrentUser,
  fetchOrthoApneaManufacturingDate,
  findOrthoApneaProduct,
} from "../../partners/orthoapnea.js";
import type { DeviceOrderProvider, DeviceOrderReceipt, DeviceOrderSubmission } from "../provider.js";
import { toOaTreatmentDto } from "./toOaTreatmentDto.js";

/**
 * OrthoApnea as a DeviceOrderProvider. Drives the same endpoints OA's own
 * portal uses, through the shared account (services/partners/orthoapnea.ts
 * owns the session, queue and partner_transaction log); this file only
 * gathers OA's objects and hands them to the pure DTO mapper.
 */
export const orthoApneaDeviceOrderProvider: DeviceOrderProvider = {
  name: "orthoapnea",

  async minDesiredDate(productCode: ProductCode): Promise<string | null> {
    try {
      const product = await findOrthoApneaProduct(productCode);
      if (!product) return null;
      return await fetchOrthoApneaManufacturingDate(product.id);
    } catch (err) {
      // The context endpoint must still answer when OA is down; the order
      // submit re-checks against OA anyway (OA is reached there or not at all).
      console.warn(`[device-orders] OrthoApnea manufacturing date unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  },

  async submitOrder({ tenantSlug, treatmentPlanId, patientId, order, delivery }: DeviceOrderSubmission): Promise<DeviceOrderReceipt> {
    // Runs only after createOrthoApneaTreatment holds the one-submit claim,
    // so a rejected duplicate never creates an OA patient either.
    const buildDto = async (): Promise<Record<string, unknown>> => {
      const oaPatientId = await ensureOrthoApneaPatient(tenantSlug, patientId, { fallbackCountryCode: delivery.countryCode });
      const patient = await withTenant(tenantSlug, (client) => getPatientById(client, patientId));
      if (!patient) throw new PartnerServiceError("orthoapnea", `local patient '${patientId}' not found`);

      const [product, clinics, me, countries] = await Promise.all([
        findOrthoApneaProduct(order.productCode),
        fetchOrthoApneaClinics(),
        fetchOrthoApneaCurrentUser(),
        fetchCountries(),
      ]);
      if (!product) throw new PartnerServiceError("orthoapnea", `product '${order.productCode}' is not offered by OrthoApnea`);
      // The shared account has exactly one clinic (34352, rules "Live read results").
      const clinic = clinics.find((c) => c.deleted !== true) ?? clinics[0];
      if (!clinic) throw new PartnerServiceError("orthoapnea", "the shared OrthoApnea account has no clinic");

      return toOaTreatmentDto(order, {
        patient: { id: Number(oaPatientId), name: [patient.first_name, patient.last_name].filter(Boolean).join(" ") },
        clinic,
        product,
        me,
        delivery,
        countryIdByIso: (iso) => countries.find((c) => c.code?.toUpperCase() === iso.toUpperCase())?.id ?? null,
        today: new Date().toISOString().slice(0, 10),
      });
    };

    // A submit interrupted more than RECONCILE_AFTER_MS ago is first looked up in OA by product (Łukasz D3).
    const result = await createOrthoApneaTreatment(tenantSlug, treatmentPlanId, buildDto, { productCode: order.productCode });
    return { externalId: result.externalId, externalStatus: result.externalStatus, sentPayload: result.requestPayload };
  },
};
