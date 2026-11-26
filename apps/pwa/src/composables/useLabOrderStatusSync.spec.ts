import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

const backgroundApiFetch = vi.fn();
const apiFetch = vi.fn();
vi.mock("./useApi", () => ({
  backgroundApiFetch: (...args: unknown[]) => backgroundApiFetch(...args),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));
const refresh = vi.fn(async () => undefined);
vi.mock("./useNotificationCenter", () => ({ useNotificationCenter: () => ({ refresh }) }));

import { useLabOrderStatusSync, LAB_ORDER_SYNC_INTERVAL_MS } from "./useLabOrderStatusSync";

let visibility: DocumentVisibilityState = "visible";
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

function respond(body: unknown) {
  backgroundApiFetch.mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
}

function mountSync() {
  return mount(defineComponent({ setup: () => (useLabOrderStatusSync(), () => h("div")) }));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  backgroundApiFetch.mockReset();
  apiFetch.mockReset();
  refresh.mockClear();
});

describe("useLabOrderStatusSync (CORE-67)", () => {
  it("syncs when the app opens, then every 15 min while it is visible", async () => {
    respond({ ran: true, checked: 2, changed: 0 });
    const wrapper = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(backgroundApiFetch).toHaveBeenCalledTimes(1);
    expect(backgroundApiFetch).toHaveBeenCalledWith("/api/v1/partners/orthoapnea/sync-statuses", expect.objectContaining({ method: "POST" }));

    await vi.advanceTimersByTimeAsync(LAB_ORDER_SYNC_INTERVAL_MS);
    expect(backgroundApiFetch).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("never goes through the loader-driving apiFetch", async () => {
    respond({ ran: false });
    const wrapper = mountSync();
    await vi.advanceTimersByTimeAsync(LAB_ORDER_SYNC_INTERVAL_MS);
    expect(apiFetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("sends nothing while the app is in the background", async () => {
    respond({ ran: false });
    const wrapper = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    setVisibility("hidden");
    await vi.advanceTimersByTimeAsync(LAB_ORDER_SYNC_INTERVAL_MS * 3);
    expect(backgroundApiFetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("refreshes the bell when a status changed, not otherwise", async () => {
    respond({ ran: true, checked: 2, changed: 1 });
    const wrapper = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);

    respond({ ran: false });
    await vi.advanceTimersByTimeAsync(LAB_ORDER_SYNC_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("stays silent when the API fails", async () => {
    backgroundApiFetch.mockResolvedValue(new Response("{}", { status: 500 }));
    const wrapper = mountSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
