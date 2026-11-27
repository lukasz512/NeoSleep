import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("./useApi", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "./useApi";
import { askNeoSleepAi } from "./useAiChat";

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("askNeoSleepAi", () => {
  it("posts only the question and returns the answer", async () => {
    vi.mocked(apiFetch).mockResolvedValue(reply(200, { answer: "Use the invite button." }));
    const result = await askNeoSleepAi("How do I invite a doctor?");
    expect(result).toEqual({ ok: true, answer: "Use the invite button." });
    const [path, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    expect(path).toBe("/api/v1/ai/chat");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ question: "How do I invite a doctor?" });
  });

  it.each([
    [429, "rate_limited"],
    [503, "unavailable"],
    [403, "forbidden"],
    [500, "failed"],
  ] as const)("maps status %i to %s", async (status, reason) => {
    vi.mocked(apiFetch).mockResolvedValue(reply(status, { error: "x" }));
    expect(await askNeoSleepAi("q")).toEqual({ ok: false, reason });
  });
});
