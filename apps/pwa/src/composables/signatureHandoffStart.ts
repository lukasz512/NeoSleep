import { apiFetch } from "./useApi";

/** The two secrets a started handoff returns: the QR's sign-only token, and the pickup token the computer keeps. */
export interface StartedHandoff {
  handoffToken: string;
  pickupToken: string;
}
export type SignatureHandoffStart = () => Promise<StartedHandoff | null>;

/**
 * How each signature pad starts its "sign on your phone" QR (CORE-172): with
 * the credential its page already holds. Null = the API refused (the panel
 * then offers a new code).
 */
function post(url: string, body?: Record<string, string>): SignatureHandoffStart {
  return async () => {
    const res = await apiFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      handleErrors: false,
    });
    return res.ok ? ((await res.json()) as StartedHandoff) : null;
  };
}

/** Partner agreement, with the invite token from the registration link. */
export const partnerHandoffStart = (inviteToken: string) => post("/api/v1/invite/sign-handoff", { token: inviteToken });

/** Patient consent on /q opened on a computer, with the questionnaire token. */
export const patientHandoffStart = (questionnaireToken: string) => post("/api/v1/public/questionnaire/sign-handoff", { token: questionnaireToken });

/** The signed-in doctor's own signature (Historia clínica print). */
export const doctorHandoffStart = () => post("/api/v1/signature-handoff");
