import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, buildDiagnosticPayload } from "@api";
import { submitWeb3Form } from "./web3forms";

/**
 * NEO-81 — a lost patient lead must never be silent: every Web3Forms failure
 * becomes a typed ApiError the caller reports, and that report never carries
 * the submitted fields.
 */
const LEAD = { access_key: "k", firstName: "María", lastName: "López", phone: "+52 55 1234 5678", email: "maria@example.mx" };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("submitWeb3Form", () => {
  it("resolves when Web3Forms accepts the submission", async () => {
    stubFetch(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    await expect(submitWeb3Form(LEAD)).resolves.toBeUndefined();
  });

  it("a rejected submission (200 + success:false) throws, with the provider message", async () => {
    stubFetch(async () => new Response(JSON.stringify({ success: false, message: "Invalid access key" }), { status: 200 }));
    const err = await submitWeb3Form(LEAD).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "bad_response", status: 200 });
    expect((err as ApiError).message).toContain("Invalid access key");
  });

  it("a network failure throws a network ApiError", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(submitWeb3Form(LEAD)).rejects.toMatchObject({ kind: "network" });
  });

  it("a 5xx without JSON throws a server ApiError", async () => {
    stubFetch(async () => new Response("<html>502</html>", { status: 502 }));
    await expect(submitWeb3Form(LEAD)).rejects.toMatchObject({ kind: "server", status: 502 });
  });

  it("the diagnostics report built from the failure contains none of the lead's data", async () => {
    stubFetch(async () => new Response(JSON.stringify({ success: false, message: "Spam detected" }), { status: 200 }));
    const err = await submitWeb3Form(LEAD).catch((e: unknown) => e);
    const payload = JSON.stringify(buildDiagnosticPayload(err, { where: "web.ContactView.submit", extra: { form_type: "patient" } }));
    for (const value of ["María", "López", "1234 5678", "maria@example.mx"]) {
      expect(payload).not.toContain(value);
    }
  });
});
