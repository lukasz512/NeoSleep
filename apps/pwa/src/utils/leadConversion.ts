import { apiFetch } from "../composables/useApi";
import { isCreatingNewOrganization } from "../config/forms/hcpForm";

/**
 * Submits the HCP conversion form (LeadDetailView.vue/LeadsView.vue's
 * "Move to contacts" dialog). When the rep typed a clinic name that matched
 * nothing on file, the organization_id field's combobox value is that raw
 * name and `new_organization` carries the rest of the mini HCO form (see
 * hcpForm.ts) — the organization is created first so its real id can be
 * passed to the practitioner create call, both landing in the same
 * ConvertLeadCommand-driven lead conversion (lead_id in the practitioner
 * payload marks the lead as converted server-side).
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
  let organizationId = data.organization_id;

  if (isCreatingNewOrganization(data)) {
    const newOrg = (data.new_organization ?? {}) as Record<string, unknown>;
    const orgRes = await apiFetch("/api/v1/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.organization_id,
        type: newOrg.org_type,
        region: newOrg.org_region,
        address_line1: newOrg.org_address_line1,
        city: newOrg.org_city,
        postal_code: newOrg.org_postal_code,
        phone: newOrg.org_phone,
      }),
    });
    if (!orgRes.ok) return false;
    const organization = (await orgRes.json()) as { id: string };
    organizationId = organization.id;
  }

  const practitionerRes = await apiFetch("/api/v1/practitioner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, organization_id: organizationId, new_organization: undefined, lead_id: leadId }),
  });
  return practitionerRes.ok;
}
