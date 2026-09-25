import { describe, it, expect, vi } from "vitest";
import { useEntitySubmit } from "./useEntitySubmit";
import { useNotifications } from "./useNotifications";

function okResponse(): Response {
  return { ok: true } as Response;
}

function failResponse(): Response {
  return { ok: false } as Response;
}

describe("useEntitySubmit", () => {
  it("on success: shows a success notification, calls done(true), then dispatches refresh and onSuccess", async () => {
    const { submit } = useEntitySubmit();
    const { current, dismissCurrent } = useNotifications();
    const order: string[] = [];
    const done = vi.fn((ok: boolean) => order.push(`done:${ok}`));
    const onSuccess = vi.fn(() => {
      order.push("onSuccess");
    });
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await submit(
      {
        request: async () => {
          order.push("request");
          return okResponse();
        },
        successMessage: "Saved",
        errorMessage: "Failed",
        icon: "nav-patients",
        onSuccess,
      },
      done,
    );

    expect(current.value?.message).toBe("Saved");
    expect(current.value?.icon).toBe("nav-patients");
    expect(current.value?.type).toBe("success");
    dismissCurrent();

    expect(done).toHaveBeenCalledWith(true);
    expect(order).toEqual(["request", "done:true", "onSuccess"]);
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: "entity-list-refresh" }));
    dispatchSpy.mockRestore();
  });

  it("does not dispatch entity-list-refresh when refresh: false", async () => {
    const { submit } = useEntitySubmit();
    const { dismissCurrent } = useNotifications();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await submit(
      { request: async () => okResponse(), successMessage: "Saved", errorMessage: "Failed", icon: "nav-patients", refresh: false },
      vi.fn(),
    );

    expect(dispatchSpy).not.toHaveBeenCalled();
    dismissCurrent();
    dispatchSpy.mockRestore();
  });

  it("on a non-ok response: shows an error notification and calls done(false), no refresh", async () => {
    const { submit } = useEntitySubmit();
    const { current, dismissCurrent } = useNotifications();
    const done = vi.fn();
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    await submit(
      { request: async () => failResponse(), successMessage: "Saved", errorMessage: "Could not save", icon: "nav-patients" },
      done,
    );

    expect(current.value?.message).toBe("Could not save");
    expect(current.value?.type).toBe("error");
    dismissCurrent();
    expect(done).toHaveBeenCalledWith(false);
    expect(dispatchSpy).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it("on a thrown network error: shows an error notification and calls done(false)", async () => {
    const { submit } = useEntitySubmit();
    const { current, dismissCurrent } = useNotifications();
    const done = vi.fn();

    await submit(
      {
        request: async () => {
          throw new Error("network down");
        },
        successMessage: "Saved",
        errorMessage: "Could not save",
        icon: "nav-patients",
      },
      done,
    );

    expect(current.value?.message).toBe("Could not save");
    expect(current.value?.type).toBe("error");
    dismissCurrent();
    expect(done).toHaveBeenCalledWith(false);
  });
});
