import { apiFetch } from "../composables/useApi";
import { resolveOrganizationIdForSubmit } from "../config/forms/hcpForm";

/**
 * Submits the HCP conversion form (LeadDetailView.vue/LeadsView.vue's
 * "Move to contacts" dialog). When the rep typed a clinic name that matched
 * nothing on file, resolveOrganizationIdForSubmit creates that organization
 * first (see hcpForm.ts) so its real id can be passed to the practitioner
 * create call, both landing in the same ConvertLeadCommand-driven lead
 * conversion (lead_id in the practitioner payload marks the lead as
 * converted server-side).
 *
 * Neither call passes `handleErrors: false` — a failure at either step
 * (including a 409 if the typed name turns out to collide with an existing
 * organization after all) surfaces via the standard global error toast,
 * same as every other apiFetch call in these forms.
 */
export async function createPractitionerFromLead(
  data: Record<string, unknown>,
  leadId: string,
): Promise<boolean> {
  const organizationId = await resolveOrganizationIdForSubmit(data);
  if (organizationId === undefined) return false;

  const practitionerRes = await apiFetch("/api/v1/practitioner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, organization_id: organizationId, new_organization: undefined, lead_id: leadId }),
  });
  return practitionerRes.ok;
}
