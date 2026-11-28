import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextTick } from "vue";

vi.mock("./useApi", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "./useApi";
import { useGlobalSearch, SEARCH_DEBOUNCE_MS } from "./useGlobalSearch";

const hit = (id: string, label: string) => ({ id, label, sublabel: "", region: "MX" });
const groups = {
  patients: [hit("p1", "Ana Lopez")],
  practitioners: [],
  organizations: [hit("o1", "Clinica Norte")],
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(apiFetch).mockReset();
});
afterEach(() => vi.useRealTimers());

async function type(s: ReturnType<typeof useGlobalSearch>, text: string) {
  s.term.value = text;
  await nextTick();
}

describe("useGlobalSearch (CORE-292)", () => {
  it("does not call the API under 2 characters", async () => {
    const s = useGlobalSearch();
    await type(s, " a ");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(s.status.value).toBe("idle");
  });

  it("debounces: one POST with the trimmed term in the body", async () => {
    vi.mocked(apiFetch).mockResolvedValue(reply(200, groups));
    const s = useGlobalSearch();
    await type(s, "an");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 50);
    await type(s, " ana ");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe("/api/v1/search");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ term: "ana" });
    expect(s.status.value).toBe("ok");
    expect(s.total.value).toBe(2);
    expect(s.groups.value?.patients[0]?.label).toBe("Ana Lopez");
  });

  it("aborts the previous request and ignores its late answer", async () => {
    let first!: (r: Response) => void;
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => new Promise<Response>((r) => (first = r)))
      .mockResolvedValueOnce(reply(200, { patients: [], practitioners: [hit("x", "Second")], organizations: [] }));
    const s = useGlobalSearch();
    await type(s, "first");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    const signal = vi.mocked(apiFetch).mock.calls[0]![1]!.signal as AbortSignal;
    await type(s, "second");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(signal.aborted).toBe(true);
    first(reply(200, groups));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.groups.value?.practitioners[0]?.label).toBe("Second");
  });

  it("maps 429 to rate_limited and other failures to error", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(reply(429, {}));
    const s = useGlobalSearch();
    await type(s, "ana");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(s.status.value).toBe("rate_limited");

    vi.mocked(apiFetch).mockResolvedValueOnce(reply(500, {}));
    await type(s, "anas");
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
    expect(s.status.value).toBe("error");
  });

  it("clear() resets state and cancels a pending search", async () => {
    vi.mocked(apiFetch).mockResolvedValue(reply(200, groups));
    const s = useGlobalSearch();
    await type(s, "ana");
    s.clear();
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
    expect(apiFetch).not.toHaveBeenCalled();
    expect(s.term.value).toBe("");
    expect(s.groups.value).toBeNull();
    expect(s.status.value).toBe("idle");
  });
});
