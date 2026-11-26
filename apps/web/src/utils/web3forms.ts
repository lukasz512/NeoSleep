/**
 * Web3Forms submit with a typed failure (NEO-81). Patient/professional leads
 * go through here, so a failure must always throw an ApiError the caller
 * reports — previously a rejected submission (`success: false`), a non-JSON
 * answer and a network error all collapsed into one silent catch.
 *
 * The error never carries the submitted fields (names, phone, email): only
 * HTTP status and the provider's own message.
 */
import { ApiError, classifyStatus, toApiError } from "@api";

const WEB3FORMS_URL = "https://api.web3forms.com/submit";
const PATH = "web3forms/submit";

export async function submitWeb3Form(body: Record<string, unknown>): Promise<void> {
  let res: Response;
  try {
    res = await fetch(WEB3FORMS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw toApiError(err, { path: PATH, method: "POST" });
  }

  let data: { success?: boolean; message?: string } | null;
  try {
    data = (await res.json()) as { success?: boolean; message?: string };
  } catch (err) {
    throw new ApiError({
      kind: res.ok ? "bad_response" : classifyStatus(res.status),
      message: `Web3Forms answered HTTP ${res.status} without JSON`,
      status: res.status,
      path: PATH,
      method: "POST",
      cause: err,
    });
  }

  if (!res.ok || !data?.success) {
    throw new ApiError({
      kind: res.ok ? "bad_response" : classifyStatus(res.status),
      message: `Web3Forms rejected the submission: ${data?.message ?? "no message"}`,
      status: res.status,
      path: PATH,
      method: "POST",
    });
  }
}
