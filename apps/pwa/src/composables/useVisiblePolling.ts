import { onBeforeUnmount, onMounted, watch } from "vue";

/**
 * Calls `tick` every `intervalMs()` while the page is visible (NEO-173) —
 * a hidden tab or a locked phone sends nothing — and once right away when
 * the user comes back to it. The interval is re-read after every tick, so
 * it can follow state (a live QR link polls faster); null pauses.
 * A tick still running is never doubled up.
 */
export function useVisiblePolling(intervalMs: () => number | null, tick: () => Promise<unknown>): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let stopped = false;

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    clear();
    const ms = intervalMs();
    if (stopped || ms === null || document.visibilityState !== "visible") return;
    timer = setTimeout(run, ms);
  }

  async function run() {
    if (running || stopped) return;
    running = true;
    try {
      await tick();
    } finally {
      running = false;
      schedule();
    }
  }

  function onVisibility() {
    if (document.visibilityState === "visible") void run();
    else clear();
  }

  // A new interval (e.g. a link just went live) takes effect now, not after the old, longer wait.
  watch(intervalMs, schedule);

  onMounted(() => {
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
  });
  onBeforeUnmount(() => {
    stopped = true;
    clear();
    document.removeEventListener("visibilitychange", onVisibility);
  });
}
