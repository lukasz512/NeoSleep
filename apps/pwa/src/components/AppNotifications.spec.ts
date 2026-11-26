import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "@i18n/en.json";
import AppNotifications from "./AppNotifications.vue";
import { retryAction, useNotifications } from "../composables/useNotifications";

const mountedWrappers: VueWrapper[] = [];

function drainNotifications() {
  const { notifications, dismiss } = useNotifications();
  for (const n of [...notifications.value]) dismiss(n.id);
}

afterEach(() => {
  for (const w of mountedWrappers.splice(0)) w.unmount();
  document.body.innerHTML = "";
  drainNotifications();
  vi.useRealTimers();
});

function mountNotifications() {
  const i18n = createI18n({ legacy: false, locale: "en", messages: { en } });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const wrapper = mount(AppNotifications, { attachTo: el, global: { plugins: [i18n] } });
  mountedWrappers.push(wrapper);
  return wrapper;
}

describe("AppNotifications", () => {
  it("renders a toast per notification, close button dismisses only that one", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("First", "info");
    show("Second", "success");
    await vi.waitFor(() => {
      expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(2);
    });

    const toasts = document.body.querySelectorAll(".notif-toast");
    toasts[0].querySelector<HTMLButtonElement>(".notif-toast__close")!.click();

    await vi.waitFor(() => {
      const remaining = document.body.querySelectorAll(".notif-toast");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].textContent).toContain("Second");
    });
  });

  it("shows multiple notifications stacked at once, not just the latest", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("One", "info");
    show("Two", "warning");
    show("Three", "error");

    await vi.waitFor(() => {
      expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(3);
    });
  });

  it("displays a type-appropriate icon and message text", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("Something failed", "error");

    await vi.waitFor(() => {
      const toast = document.body.querySelector(".notif-toast--error");
      expect(toast).not.toBeNull();
      expect(toast!.textContent).toContain("Something failed");
      expect(toast!.querySelector(".notif-toast__icon")).not.toBeNull();
    });
  });

  it("uses role=\"alert\" for error/warning toasts (assertive) and role=\"status\" for info/success (polite)", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("Something failed", "error");
    show("Careful", "warning");
    show("FYI", "info");
    show("Saved", "success");

    await vi.waitFor(() => {
      expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(4);
    });

    expect(document.body.querySelector(".notif-toast--error")!.getAttribute("role")).toBe("alert");
    expect(document.body.querySelector(".notif-toast--warning")!.getAttribute("role")).toBe("alert");
    expect(document.body.querySelector(".notif-toast--info")!.getAttribute("role")).toBe("status");
    expect(document.body.querySelector(".notif-toast--success")!.getAttribute("role")).toBe("status");
  });

  it("auto-dismisses a toast after 8 seconds", async () => {
    vi.useFakeTimers();
    mountNotifications();
    const { show } = useNotifications();
    show("Autosave complete", "success");
    await vi.advanceTimersByTimeAsync(10);
    expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(8000);
    expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(0);
  });

  it("record context: draws the given entity icon on the tile, a status badge, and the record line", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("Note added", "success", undefined, { icon: "pencil", context: "Anna Nowak" });

    await vi.waitFor(() => {
      const toast = document.body.querySelector(".notif-toast--success")!;
      expect(toast.querySelector(".notif-toast__tile .notif-toast__icon")).not.toBeNull();
      expect(toast.querySelector(".notif-toast__badge .app-icon")).not.toBeNull();
      expect(toast.querySelector(".notif-toast__context")!.textContent).toBe("Anna Nowak");
    });
  });

  it("without an icon every type still gets one (generic per type), and no record line", async () => {
    mountNotifications();
    const { show } = useNotifications();
    show("Plain", "warning");

    await vi.waitFor(() => {
      const toast = document.body.querySelector(".notif-toast--warning")!;
      expect(toast.querySelector(".notif-toast__icon")).not.toBeNull();
      expect(toast.querySelector(".notif-toast__context")).toBeNull();
      expect(toast.querySelector(".notif-toast__action")).toBeNull();
    });
  });

  it("action button: labelled from i18n, dismisses the toast and runs the action once", async () => {
    mountNotifications();
    const { show } = useNotifications();
    const run = vi.fn();
    show("Couldn't load documents", "error", undefined, { icon: "file", action: retryAction(run) });

    const button = await vi.waitFor(() => {
      const b = document.body.querySelector<HTMLButtonElement>(".notif-toast__action");
      expect(b).not.toBeNull();
      return b!;
    });
    expect(button.textContent?.trim()).toBe("Retry");
    button.click();

    expect(run).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(0);
    });
  });

  it("a toast with an action stays 12 s instead of 8 s, so there is time to reach the button", async () => {
    vi.useFakeTimers();
    mountNotifications();
    const { show } = useNotifications();
    show("Couldn't load documents", "error", undefined, { action: retryAction(() => {}) });
    await vi.advanceTimersByTimeAsync(8_500);
    expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(1);
    expect(document.body.querySelector<HTMLElement>(".notif-toast__bar")!.style.animationDuration).toBe("12000ms");

    await vi.advanceTimersByTimeAsync(4_000);
    expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(0);
  });

  it("countdown toast: shows the seconds left, ticks down, and does not auto-dismiss", async () => {
    vi.useFakeTimers();
    mountNotifications();
    const { show } = useNotifications();
    show("", "info", "app.update.reloading", { countdownMs: 5_000 });
    await vi.advanceTimersByTimeAsync(10);
    const text = () => document.body.querySelector(".notif-toast__msg")!.textContent;
    expect(text()).toContain("reloading in 5 s");
    expect(document.body.querySelector<HTMLElement>(".notif-toast__bar")!.style.animationDuration).toBe("5000ms");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(text()).toContain("reloading in 3 s");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(document.body.querySelectorAll(".notif-toast")).toHaveLength(1);
    expect(text()).toContain("reloading in 0 s");
  });
});
