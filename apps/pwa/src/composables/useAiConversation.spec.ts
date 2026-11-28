import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./useAiChat", async (orig) => ({ ...(await orig<typeof import("./useAiChat")>()), askNeoSleepAi: vi.fn() }));

import { askNeoSleepAi } from "./useAiChat";
import { useAiConversation } from "./useAiConversation";

beforeEach(() => vi.mocked(askNeoSleepAi).mockReset());

describe("useAiConversation (CORE-292)", () => {
  it("cannot ask when empty, blank or over 500 chars", () => {
    const c = useAiConversation();
    expect(c.canAsk.value).toBe(false);
    c.question.value = "   ";
    expect(c.canAsk.value).toBe(false);
    c.question.value = "x".repeat(501);
    expect(c.canAsk.value).toBe(false);
    c.question.value = "How?";
    expect(c.canAsk.value).toBe(true);
  });

  it("stores the trimmed question and the answer", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({ ok: true, answer: "Like this." });
    const c = useAiConversation();
    c.question.value = "  How?  ";
    await c.ask();
    expect(askNeoSleepAi).toHaveBeenCalledWith("How?");
    expect(c.asked.value).toBe("How?");
    expect(c.answer.value).toBe("Like this.");
    expect(c.errorKey.value).toBe("");
    expect(c.loading.value).toBe(false);
  });

  it("maps failures to an error key and keeps the typed text", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({ ok: false, reason: "rate_limited" });
    const c = useAiConversation();
    c.question.value = "How?";
    await c.ask();
    expect(c.errorKey.value).toBe("ai.error.rate_limited");
    expect(c.question.value).toBe("How?");
    expect(c.answer.value).toBe("");
  });

  it("treats a thrown request as failed", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({
      // A malformed reply that blows up while being read; vitest flags a mock that rejects itself.
      get ok(): boolean {
        throw new Error("malformed");
      },
    } as unknown as Awaited<ReturnType<typeof askNeoSleepAi>>);
    const c = useAiConversation();
    c.question.value = "How?";
    await c.ask();
    expect(c.errorKey.value).toBe("ai.error.failed");
  });

  it("ignores a second ask while one is in flight (double Enter)", async () => {
    let resolve!: (v: { ok: true; answer: string }) => void;
    vi.mocked(askNeoSleepAi).mockReturnValue(new Promise((r) => (resolve = r)));
    const c = useAiConversation();
    c.question.value = "How?";
    const first = c.ask();
    await c.ask();
    resolve({ ok: true, answer: "A" });
    await first;
    expect(askNeoSleepAi).toHaveBeenCalledTimes(1);
  });

  it("reset clears everything", async () => {
    vi.mocked(askNeoSleepAi).mockResolvedValue({ ok: true, answer: "A" });
    const c = useAiConversation();
    c.question.value = "How?";
    await c.ask();
    c.reset();
    expect([c.question.value, c.asked.value, c.answer.value, c.errorKey.value]).toEqual(["", "", "", ""]);
  });
});
