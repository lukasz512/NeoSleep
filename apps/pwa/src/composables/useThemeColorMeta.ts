import { onBeforeUnmount, onMounted } from "vue";

/**
 * Resolves any CSS color (a custom property, color-mix(), a hex) to #rrggbb
 * as the browser paints it: a hidden probe resolves var()/color-mix() to its
 * computed color, a 1×1 canvas turns that (Chrome serializes color-mix() as
 * `color(srgb …)`) into plain hex, which every browser's theme-color accepts.
 * Falls back to the computed string where canvas isn't available (jsdom).
 */
function resolveColor(css: string): string {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:${css}`;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color || css;
  probe.remove();

  const ctx = document.createElement("canvas").getContext?.("2d", { willReadFrequently: true });
  if (!ctx) return computed;
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * NEO-131: tints the browser/OS chrome around the app — the installed app's
 * window title bar, the phone status bar, Safari's toolbar — with `color`
 * (any CSS color, e.g. "var(--pwa-desk)"), so it reads as one surface with
 * the layout's own top edge instead of the manifest's fixed teal.
 *
 * Re-resolved whenever <html> changes theme (data-theme, set by the theme
 * store — also inside a view transition) or the tenant's runtime colors
 * (inline style, set by the config store). index.html ships one static tag
 * per OS theme (media="(prefers-color-scheme: …)") so the first frame is
 * already right; while the layout is mounted this sets every theme-color tag
 * to its own color — an explicit in-app theme can differ from the OS one —
 * and puts the original values back on unmount, so the next layout starts
 * from its own color, never a leftover.
 */
export function useThemeColorMeta(color: () => string): void {
  let metas: HTMLMetaElement[] = [];
  let originals: (string | null)[] = [];
  let created = false;
  let observer: MutationObserver | null = null;

  function apply() {
    const next = resolveColor(color());
    for (const meta of metas) {
      if (meta.getAttribute("content") !== next) meta.setAttribute("content", next);
    }
  }

  onMounted(() => {
    metas = [...document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    created = metas.length === 0;
    if (created) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
      metas = [meta];
    }
    originals = metas.map((m) => m.getAttribute("content"));
    apply();
    observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    if (created) metas.forEach((m) => m.remove());
    else metas.forEach((m, i) => m.setAttribute("content", originals[i] ?? ""));
    metas = [];
    originals = [];
  });
}
