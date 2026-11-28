/**
 * NeoSleep AI chat (CORE-274): one question, one answer, admin only. The key and the
 * knowledge stay on the API server; the browser only sends the question text.
 */
import { apiFetch } from "./useApi";

export const MAX_AI_QUESTION_CHARS = 500;

export type AiAskResult =
  | { ok: true; answer: string }
  | { ok: false; reason: "rate_limited" | "unavailable" | "forbidden" | "failed" };

export async function askNeoSleepAi(question: string): Promise<AiAskResult> {
  // handleErrors: false — the view words each failure itself instead of a generic toast.
  const res = await apiFetch("/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    handleErrors: false,
  });
  if (res.ok) {
    const body = (await res.json()) as { answer: string };
    return { ok: true, answer: body.answer };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limited" };
  if (res.status === 503) return { ok: false, reason: "unavailable" };
  if (res.status === 403) return { ok: false, reason: "forbidden" };
  return { ok: false, reason: "failed" };
}
