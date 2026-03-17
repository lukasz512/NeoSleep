import { onMounted } from "vue";

const DURATION_MS = 1500;

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function smoothScrollToSection(el: HTMLElement, durationMs: number): void {
  const offset = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--scroll-anchor-offset") || "96",
    10
  );
  const start = window.scrollY ?? document.documentElement.scrollTop;
  const end = el.getBoundingClientRect().top + start - offset;
  const startTime = performance.now();

  function step(now: number): void {
    const t = Math.min((now - startTime) / durationMs, 1);
    window.scrollTo(0, start + (end - start) * easeInOutQuint(t));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function isSamePageHashLink(link: HTMLAnchorElement): boolean {
  if (link.target === "_blank") return false;
  if (link.href.startsWith("mailto:") || link.href.startsWith("tel:")) return false;
  const href = link.getAttribute("href") ?? "";
  const hashIdx = href.indexOf("#");
  if (hashIdx === -1 || href.slice(hashIdx) === "#") return false;
  const pathname = link.pathname || "/";
  return pathname === window.location.pathname;
}

export function smoothScrollToTop(): void {
  const start = window.scrollY;
  if (start === 0) return;
  const startTime = performance.now();

  function step(now: number): void {
    const t = Math.min((now - startTime) / DURATION_MS, 1);
    window.scrollTo(0, start * (1 - easeInOutQuint(t)));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * Reaguje na kliknięcia w linki z hashem (#section) na tej samej stronie:
 * zamiast skoku przewija płynnie do sekcji. Nie obsługuje mailto:, tel:, _blank.
 */
export function useSmoothScrollAnchors(): void {
  onMounted(() => {
    document.addEventListener("click", (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest('a[href*="#"]') as HTMLAnchorElement | null;
      if (!link || !isSamePageHashLink(link)) return;

      const href = link.getAttribute("href") ?? "";
      const hash = href.slice(href.indexOf("#"));
      const id = hash.slice(1);
      const el = document.getElementById(id);
      if (!el) return;

      e.preventDefault();
      smoothScrollToSection(el, DURATION_MS);
      history.replaceState(null, "", hash);
    });
  });
}
