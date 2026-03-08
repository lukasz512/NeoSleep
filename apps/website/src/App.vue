<template>
  <DefaultLayout />
</template>

<script setup lang="ts">
import { onMounted } from "vue";
import DefaultLayout from "./layouts/DefaultLayout.vue";
import "./assets/website-theme.scss";

const SMOOTH_SCROLL_DURATION_MS = 1500;

function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function smoothScrollToSection(el: HTMLElement | null, durationMs: number): void {
  if (!el) return;
  const headerHeight = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue("--website-header-height") || "72",
    10
  );
  const start = window.scrollY ?? document.documentElement.scrollTop;
  const end = el.getBoundingClientRect().top + start - headerHeight;
  const startTime = performance.now();

  function step(now: number): void {
    const t = Math.min((now - startTime) / durationMs, 1);
    const eased = easeInOutQuint(t);
    window.scrollTo(0, start + (end - start) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

onMounted(() => {
  document.addEventListener("click", (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a[href*="#"]');
    if (
      !link ||
      link.target === "_blank" ||
      link.href.startsWith("mailto:") ||
      link.href.startsWith("tel:")
    )
      return;
    const href = link.getAttribute("href") ?? "";
    const hashIdx = href.indexOf("#");
    if (hashIdx === -1) return;
    const hash = href.slice(hashIdx);
    if (hash === "#") return;
    const pathname = link.pathname || "/";
    if (pathname !== window.location.pathname) return;
    const id = hash.slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    smoothScrollToSection(el, SMOOTH_SCROLL_DURATION_MS);
    history.replaceState(null, "", hash);
  });
});
</script>

<style>
#app {
  font-family: var(--website-font-sans);
  background: var(--website-bg);
  color: var(--website-text);
}
</style>
