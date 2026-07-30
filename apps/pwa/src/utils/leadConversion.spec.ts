import { describe, it, expect, vi, beforeEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("../composables/useBffApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

let creatingNew = false;
vi.mock("../config/forms/hcpForm", () => ({
  isCreatingNewOrganization: () => creatingNew,
}));

import { createPractitionerFromLead } from "./leadConversion";

function jsonResponse(ok: boolean, status: number, body: unknown) {
  return { ok, status, json: async () => body } as Response;
}

describe("createPractitionerFromLead", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    creatingNew = false;
  });

  it("skips organization creation and posts the practitioner directly when the clinic already matches one on file", async () => {
    creatingNew = false;
    apiFetch.mockResolvedValueOnce(jsonResponse(true, 201, { id: "practitioner-1" }));

    const ok = await createPractitionerFromLead(
      { organization_id: "org-existing", first_name: "Anna" },
      "lead-1",
    );

    expect(ok).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = apiFetch.mock.calls[0];
    expect(url).toBe("/api/v1/practitioner");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ organization_id: "org-existing", lead_id: "lead-1", first_name: "Anna" });
  });

  it("creates the organization first, then the practitioner with the returned id, when typing a brand new clinic", async () => {
    creatingNew = true;
    apiFetch
      .mockResolvedValueOnce(jsonResponse(true, 201, { id: "org-new-1" }))
      .mockResolvedValueOnce(jsonResponse(true, 201, { id: "practitioner-1" }));

    const ok = await createPractitionerFromLead(
      {
        organization_id: "Brand New Clinic",
        new_organization: { org_type: "clinic", org_region: "PL", org_city: "Warsaw" },
        first_name: "Anna",
      },
      "lead-1",
    );

    expect(ok).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(2);

    const [orgUrl, orgInit] = apiFetch.mock.calls[0];
    expect(orgUrl).toBe("/api/v1/organization");
    const orgBody = JSON.parse((orgInit as RequestInit).body as string);
    expect(orgBody).toMatchObject({ name: "Brand New Clinic", type: "clinic", region: "PL", city: "Warsaw" });

    const [pracUrl, pracInit] = apiFetch.mock.calls[1];
    expect(pracUrl).toBe("/api/v1/practitioner");
    const pracBody = JSON.parse((pracInit as RequestInit).body as string);
    // organization_id is overwritten with the newly created org's real id,
    // and new_organization must not leak into the practitioner payload.
    expect(pracBody.organization_id).toBe("org-new-1");
    expect(pracBody.new_organization).toBeUndefined();
    expect(pracBody.lead_id).toBe("lead-1");
  });

  it("stops and returns false without ever calling the practitioner endpoint when organization creation fails (e.g. 409 duplicate name)", async () => {
    creatingNew = true;
    apiFetch.mockResolvedValueOnce(jsonResponse(false, 409, { error: 'An organization named "Brand New Clinic" already exists' }));

    const ok = await createPractitionerFromLead(
      { organization_id: "Brand New Clinic", new_organization: {} },
      "lead-1",
    );

    expect(ok).toBe(false);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});
