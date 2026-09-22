/**
 * A practitioner's clinic affiliation, as returned by GET /api/v1/practitioner/:id
 * and the /organizations sub-routes (see apps/api/src/db/practitionerOrganization.ts's
 * OrganizationAffiliation — this mirrors that DTO). Kept in a plain .ts file, not
 * exported from PractitionerClinicsPanel.vue — a named type import from a .vue
 * file only resolves through this app's "*.vue" ambient shim's default export
 * (see utils/hcoLabels.ts's own comment for the same constraint).
 */
export interface OrganizationAffiliation {
  id: string;
  organization_id: string;
  name: string;
  type: string | null;
  address_line1: string | null;
  city: string | null;
  role: string | null;
  is_primary: boolean;
}
