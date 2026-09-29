import { describe, it, expect, vi, beforeEach } from "vitest";

// resend is the external boundary here (a paid third-party HTTP API) — mocked so these
// tests never make a real network call or need a real API key, and so they run as part
// of the normal blocking `pnpm --filter @neo/api test` in CI (see ADR-016). This does not
// conflict with CLAUDE.md's "no mock-only tests" rule — that rule is scoped to PostgreSQL
// integration tests, not third-party paid APIs (see googleCalendar.spec.ts for the same
// pattern against another external service). env.js is re-mocked per test via
// importMailer() below so both the "configured" and "not configured" code paths are
// covered, the same way googleCalendar.spec.ts covers both for Google Calendar.
const sendMock = vi.fn();

vi.mock("resend", () => ({
  // Arrow functions can't be used as constructors — mailer.ts calls `new Resend(...)`.
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send: sendMock } };
  }),
}));

const RECIPIENT = { title: "Dr", firstName: "Jane", lastName: "Doe", language: "en", region: "PL" };
const SENDER = { name: "NeoSleep", email: "rep@neosleepcare.com" };

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "test-email-id" }, error: null });
});

/**
 * Re-mocks env.js and re-imports mailer.js fresh so each test gets its own
 * configured/unconfigured env — module-level `const resend = RESEND_API_KEY ? ... : null`
 * in mailer.ts is only re-evaluated across a resetModules() + fresh import, not by
 * mutating process.env on an already-imported module.
 */
async function importMailer(configured: boolean, overrides: Record<string, string | undefined> = {}) {
  vi.doMock("./env.js", () => ({
    RESEND_API_KEY: configured ? "re_test_key" : undefined,
    RESEND_FROM_EMAIL: configured ? "notifications@mail.neosleepcare.com" : undefined,
    RESEND_NOTIFY_TO: configured ? "admin@neosleepcare.com" : undefined,
    PARTNER_DOCS_CC_EMAIL: undefined,
    ...overrides,
  }));
  vi.resetModules();
  return import("./mailer.js");
}

describe("mailer — not configured", () => {
  it("sendPasswordResetEmail no-ops without calling Resend when RESEND_API_KEY is unset", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendPasswordResetEmail } = await importMailer(false);

    await expect(
      sendPasswordResetEmail("doctor@example.com", "https://pwa.neosleepcare.com/reset-password?token=abc", RECIPIENT)
    ).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Resend not configured"));
    warnSpy.mockRestore();
  });

  it("sendContactEmail no-ops when RESEND_NOTIFY_TO is unset even if the API key is present", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendContactEmail } = await importMailer(true, { RESEND_NOTIFY_TO: undefined });

    await expect(sendContactEmail("New inquiry", [["Name", "Jane Doe"]])).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("mailer — configured", () => {
  it("sendPasswordResetEmail sends from RESEND_FROM_EMAIL with the reset link in the HTML body", async () => {
    const { sendPasswordResetEmail } = await importMailer(true);
    const resetLink = "https://pwa.neosleepcare.com/reset-password?token=abc123";

    await sendPasswordResetEmail("doctor@example.com", resetLink, RECIPIENT);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]![0];
    expect(call.to).toBe("doctor@example.com");
    expect(call.from).toContain("notifications@mail.neosleepcare.com");
    expect(call.subject).toBeTruthy();
    expect(call.html).toContain(resetLink);
    expect(call.attachments.length).toBeGreaterThan(0);
  });

  it("sendQuestionnaireLinkEmail is from '<clinic> | NeoSleep' with Reply-To the clinic (NEO-162)", async () => {
    const { sendQuestionnaireLinkEmail } = await importMailer(true);

    await sendQuestionnaireLinkEmail("patient@example.com", "https://pwa.neosleepcare.com/q/abc", RECIPIENT, { name: "Clínica Sonrisa, S.C.", email: "hola@sonrisa.mx" }, 2);

    const call = sendMock.mock.calls[0]![0];
    expect(call.from).toBe('"Clínica Sonrisa, S.C. | NeoSleep" <notifications@mail.neosleepcare.com>');
    expect(call.replyTo).toBe("hola@sonrisa.mx");
  });

  it("sendQuestionnaireLinkEmail strips header-breaking characters from the clinic name and falls back to NeoSleep", async () => {
    const { sendQuestionnaireLinkEmail } = await importMailer(true);

    await sendQuestionnaireLinkEmail("patient@example.com", "https://x", RECIPIENT, { name: 'Evil\r\nBcc: a@b.c <"x">', email: null }, 1);
    await sendQuestionnaireLinkEmail("patient@example.com", "https://x", RECIPIENT, { name: null, email: null }, 1);

    expect(sendMock.mock.calls[0]![0].from).toBe('"Evil Bcc: a@b.c \\"x\\" | NeoSleep" <notifications@mail.neosleepcare.com>');
    expect(sendMock.mock.calls[1]![0].from).toBe('"NeoSleep" <notifications@mail.neosleepcare.com>');
  });

  it("tags patient emails for the delivery webhook, returns Resend's id and logs only a masked address (NEO-190)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendQuestionnaireLinkEmail } = await importMailer(true);

    const id = await sendQuestionnaireLinkEmail("lucia@example.mx", "https://x", RECIPIENT, { name: null, email: null }, 1, { tenant: "neosleep", kind: "questionnaire_link" });

    expect(id).toBe("test-email-id");
    expect(sendMock.mock.calls[0]![0].tags).toEqual([{ name: "tenant", value: "neosleep" }, { name: "kind", value: "questionnaire_link" }]);
    const logged = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("l***@example.mx");
    expect(logged).not.toContain("lucia@example.mx");
    logSpy.mockRestore();
  });

  it("sendEmailSentConfirmation tells the doctor who/what/when in their language, with no patient link (NEO-192)", async () => {
    const { sendEmailSentConfirmation } = await importMailer(true);

    await sendEmailSentConfirmation("doctor@neosleepcare.com", { patient: "Lucía C.", sentTo: "l***@example.mx", count: 2, clinic: "Clínica Sonrisa", language: "pl" });

    const call = sendMock.mock.calls[0]![0];
    expect(call.to).toBe("doctor@neosleepcare.com");
    expect(call.from).toBe('"Clínica Sonrisa | NeoSleep" <notifications@mail.neosleepcare.com>');
    expect(call.subject).toContain("Lucía C.");
    expect(call.html).toContain("l***@example.mx");
    expect(call.html).not.toMatch(/\/q#|href="https?:\/\/[^"]*pwa/);
  });

  it("a recipient Resend refuses becomes EMAIL_REJECTED (422), not a generic failure (NEO-202)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendQuestionnaireLinkEmail, EmailRejectedError } = await importMailer(true);
    sendMock.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Invalid `to` field. Please use our testing email address instead of domains like `example.com`." } });

    const err = await sendQuestionnaireLinkEmail("q@example.com", "https://x", RECIPIENT, { name: null, email: null }, 1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmailRejectedError);
    expect(err).toMatchObject({ code: "EMAIL_REJECTED", statusCode: 422 });
  });

  it("other Resend validation errors stay plain errors — the address isn't blamed for them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendQuestionnaireLinkEmail, EmailRejectedError } = await importMailer(true);
    sendMock.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Invalid `tags` value" } });

    const err = await sendQuestionnaireLinkEmail("ok@neosleepcare.com", "https://x", RECIPIENT, { name: null, email: null }, 1).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EmailRejectedError);
  });

  it("sendContactEmail sends to RESEND_NOTIFY_TO with the given subject and rows rendered in the HTML", async () => {
    const { sendContactEmail } = await importMailer(true);

    await sendContactEmail("New inquiry", [["Name", "Jane Doe"], ["Email", "jane@example.com"]]);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]![0];
    expect(call.to).toBe("admin@neosleepcare.com");
    expect(call.subject).toBe("New inquiry");
    expect(call.html).toContain("Jane Doe");
    expect(call.html).toContain("jane@example.com");
  });

  it("sendPartnerInviteEmail sends to the invitee with the register link in the HTML body", async () => {
    const { sendPartnerInviteEmail } = await importMailer(true);
    const registerLink = "https://pwa.neosleepcare.com/register?token=xyz789";

    await sendPartnerInviteEmail("hcp@example.com", registerLink, RECIPIENT, SENDER);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0]![0];
    expect(call.to).toBe("hcp@example.com");
    expect(call.html).toContain(registerLink);
  });

  it("sendSignedDocumentsEmail addresses the doctor formally by title + name and links to login", async () => {
    const { sendSignedDocumentsEmail } = await importMailer(true);
    const loginLink = "https://pwa.neosleepcare.com/login";
    const doc = { filename: "agreement.pdf", content: Buffer.from("%PDF") };

    await sendSignedDocumentsEmail("jan@example.com", { ...RECIPIENT, language: "pl", title: null, firstName: "Jan", lastName: "Kowalski" }, [doc], loginLink);

    const call = sendMock.mock.calls[0]![0];
    expect(call.html).toContain("Dr Jan Kowalski,");
    expect(call.html).not.toContain("Cześć");
    expect(call.html).not.toContain("jan@example.com,");
    expect(call.html).toContain(loginLink);
    expect(call.html).toContain("Zaloguj się do NeoSleep");
    expect(call.attachments).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "agreement.pdf" })]));
  });

  it("logs and rethrows when Resend returns an API error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 },
    });
    const { sendPasswordResetEmail } = await importMailer(true);

    await expect(
      sendPasswordResetEmail("doctor@example.com", "https://pwa.neosleepcare.com/reset-password?token=abc", RECIPIENT)
    ).rejects.toThrow(/rate_limit_exceeded: Too many requests/);

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs and rethrows when the Resend client itself throws (network failure)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMock.mockRejectedValue(new Error("fetch failed"));
    const { sendPasswordResetEmail } = await importMailer(true);

    await expect(
      sendPasswordResetEmail("doctor@example.com", "https://pwa.neosleepcare.com/reset-password?token=abc", RECIPIENT)
    ).rejects.toThrow("fetch failed");

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
