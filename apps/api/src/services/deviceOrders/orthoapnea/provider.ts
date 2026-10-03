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
  listOrthoApneaTreatments,
} from "../../partners/orthoapnea.js";
import { DEPLOY_ENV } from "../../../env.js";
import type { DeviceOrderProvider, DeviceOrderReceipt, DeviceOrderSubmission } from "../provider.js";
import type { RemoteOrder } from "../reconcile.js";
import { toOaTreatmentDto } from "./toOaTreatmentDto.js";

/**
 * OrthoApnea as a DeviceOrderProvider. Drives the same endpoints OA's own
 * portal uses, through the shared account (services/partners/orthoapnea.ts
 * owns the session, queue and partner_transaction log); this file only
 * gathers OA's objects and hands them to the pure DTO mapper.
 */
/**
 * The environment tag goes into OA's order notes, which OA staff read.
 * Approved by Łukasz on 2026-10-03 (NEO-218 D1) as
 * "[NeoSleep PROD · ref 1a2b3c4d] — referencia interna NeoSleep, no requiere acción".
 */
export const ENV_TAG_APPROVED = true;

/**
 * Every field we send that OA stores back unchanged (sent DTO vs OA's stored
 * DTO for order 454012, shot S3, 2026-10-03). Server-owned keys (id, status,
 * dates OA sets, user/clinic objects) are left out.
 */
const OA_COMPARED_PATHS = [
  "patientId",
  "product.code",
  "desiredDate",
  "teethStatus",
  "observations",
  "deliveryAddress.name",
  "deliveryAddress.address",
  "deliveryAddress.city",
  "deliveryAddress.province",
  "deliveryAddress.countryId",
  "deliveryAddress.postalCode",
  "deliveryAddress.phone",
  "deliveryAddress.email",
  "verticalDimension",
  "retrusionMax",
  "protrusionMax",
  "startingPoint",
  "sequenceTypeStandard",
  "sequenceTypePersonalized",
  "sequenceUnitInMM",
  "sequence",
  "deviationRight",
  "deviationAdvanceRight",
  "deviationLeft",
  "deviationAdvanceLeft",
  "laterality",
  "limitOpening",
  "anteriorFrontalOpening",
  "mixedSplintDesign",
  "scallopedSplintDesign",
  "slotsForElasticBands",
  "upperBandSplintDesign",
  "lowerBandSplintDesign",
  "scannerPlatform",
  "scannerTreatment",
  "morningAligner",
  "noContactDoctorForRedesign",
  "facialBiotype",
] as const;

function str(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

/** One entry of OA's order list → the neutral shape the reconciliation reads. */
export function toRemoteOrder(dto: Record<string, unknown>): RemoteOrder {
  const patient = dto.patient as { name?: unknown } | null | undefined;
  return {
    externalId: String(dto.id),
    status: str(dto.statusId),
    requestDate: str(dto.requestDate),
    observations: typeof dto.observations === "string" ? dto.observations : "",
    patientName: str(dto.patientName) ?? str(patient?.name),
    payload: dto,
  };
}

export const orthoApneaDeviceOrderProvider: DeviceOrderProvider = {
  name: "orthoapnea",
  comparedPaths: OA_COMPARED_PATHS,
  comparedDatePaths: ["desiredDate"],

  async listRemoteOrders(): Promise<RemoteOrder[]> {
    return (await listOrthoApneaTreatments()).map(toRemoteOrder);
  },

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
        envTag: ENV_TAG_APPROVED ? { env: DEPLOY_ENV, treatmentPlanId } : null,
      });
    };

    // A submit interrupted more than RECONCILE_AFTER_MS ago is first looked up in OA by product (Łukasz D3).
    const result = await createOrthoApneaTreatment(tenantSlug, treatmentPlanId, buildDto, { productCode: order.productCode });
    return { externalId: result.externalId, externalStatus: result.externalStatus, sentPayload: result.requestPayload };
  },
};
