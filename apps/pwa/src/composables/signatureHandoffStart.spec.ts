import { describe, it, expect, vi, afterEach } from "vitest";

const apiFetch = vi.fn();
vi.mock("./useApi", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { partnerHandoffStart, patientHandoffStart, doctorHandoffStart } from "./signatureHandoffStart";

afterEach(() => apiFetch.mockReset());

const STARTED = { handoffToken: "h", pickupToken: "p", expiresAt: "2099-01-01T00:00:00Z" };

describe("signatureHandoffStart — each pad starts its QR with its own credential (CORE-172)", () => {
  it.each([
    ["partner agreement", () => partnerHandoffStart("invite-token"), "/api/v1/invite/sign-handoff", { token: "invite-token" }],
    ["patient consent on /q", () => patientHandoffStart("q-token"), "/api/v1/public/questionnaire/sign-handoff", { token: "q-token" }],
    ["doctor print (session)", () => doctorHandoffStart(), "/api/v1/signature-handoff", {}],
  ])("%s → POST %s with the credential in the body", async (_label, make, url, body) => {
    apiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => STARTED });
    expect(await make()()).toEqual(STARTED);
    const [calledUrl, init] = apiFetch.mock.calls[0]!;
    expect(calledUrl).toBe(url);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(body);
  });

  it("a refused start gives null (the panel then offers a new code)", async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 410, json: async () => ({}) });
    expect(await patientHandoffStart("dead")()).toBeNull();
  });
});
