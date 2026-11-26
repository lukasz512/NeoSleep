import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("../composables/useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

// resolveOrganizationIdForSubmit's own org-creation behavior (create-if-unknown,
// bail on failure) is covered directly in config/forms/hcpForm.spec.ts — mocked
// here so this file only asserts what createPractitionerFromLead itself does
// with whatever id (or undefined) that resolution returns.
const resolveOrganizationIdForSubmit = vi.fn();
vi.mock("../config/forms/hcpForm", () => ({
  resolveOrganizationIdForSubmit: (...args: unknown[]) => resolveOrganizationIdForSubmit(...args),
}));

import { createPractitionerFromLead } from "./leadConversion";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

describe("createPractitionerFromLead", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    resolveOrganizationIdForSubmit.mockReset();
  });

  it("posts the practitioner with whatever organization id resolution returned, plus the lead id", async () => {
    resolveOrganizationIdForSubmit.mockResolvedValueOnce("org-existing");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { id: "practitioner-1" }));

    const data = { organization_id: "org-existing", first_name: "Anna" };
    const ok = await createPractitionerFromLead(data, "lead-1");

    expect(ok).toBe(true);
    expect(resolveOrganizationIdForSubmit).toHaveBeenCalledWith(data);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/v1/practitioner");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ organization_id: "org-existing", lead_id: "lead-1", first_name: "Anna" });
  });

  it("substitutes the newly created organization's id and drops new_organization from the practitioner payload", async () => {
    resolveOrganizationIdForSubmit.mockResolvedValueOnce("org-new-1");
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { id: "practitioner-1" }));

    const ok = await createPractitionerFromLead(
      {
        organization_id: "Brand New Clinic",
        new_organization: { org_type: "clinic", org_region: "PL", org_city: "Warsaw" },
        first_name: "Anna",
      },
      "lead-1",
    );

    expect(ok).toBe(true);
    const [pracUrl, pracInit] = apiFetch.mock.calls[0];
    expect(pracUrl).toBe("/api/v1/practitioner");
    const pracBody = JSON.parse((pracInit as RequestInit).body as string);
    expect(pracBody.organization_id).toBe("org-new-1");
    expect(pracBody.new_organization).toBeUndefined();
    expect(pracBody.lead_id).toBe("lead-1");
  });

  it("stops and returns false without ever calling the practitioner endpoint when organization resolution fails (e.g. 409 duplicate name)", async () => {
    resolveOrganizationIdForSubmit.mockResolvedValueOnce(undefined);

    const ok = await createPractitionerFromLead(
      { organization_id: "Brand New Clinic", new_organization: {} },
      "lead-1",
    );

    expect(ok).toBe(false);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
