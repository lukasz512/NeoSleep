import { ref, onMounted, onUnmounted } from "vue";
import { useMediaQuery } from "@vueuse/core";

const SCROLL_HIDE_THRESHOLD = 120;
const MOUSE_FACTOR = 0.07;
const SMOOTH = 0.22;
const SPEED_TO_AMPLITUDE = 0.04;
const BASE_WAVE_AMPLITUDE = 20;
const MAX_WAVE_AMPLITUDE = 48;
const SPEED_SMOOTH = 0.06;
const WAVE_PHASE_SPEED = 0.02;
const IDLE_DRIFT_AMPLITUDE = 4;
const IDLE_DRIFT_SPEED = 0.0006;

export function useFloatingNav() {
  const translateX = ref(0);
  const translateY = ref(0);
  const waveAmplitude = ref(BASE_WAVE_AMPLITUDE);
  const wavePhase = ref(0);
  const wavesVisible = ref(true);
  const isReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  let scrollY = 0;
  let mouseX = 0;
  let mouseY = 0;
  let currentX = 0;
  let currentY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let currentSpeed = 0;
  let rafId: number | null = null;

  function onMouseMove(e: MouseEvent) {
    if (isReducedMotion.value) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    mouseX = (e.clientX - w / 2) * MOUSE_FACTOR;
    mouseY = (e.clientY - h / 2) * MOUSE_FACTOR;

    const t = performance.now();
    if (lastT > 0) {
      const dt = (t - lastT) / 1000;
      if (dt > 0 && dt < 0.2) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const speed = Math.sqrt(dx * dx + dy * dy) / dt;
        currentSpeed = speed;
      }
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = t;
  }

  function onScroll() {
    scrollY = window.scrollY;
    wavesVisible.value = scrollY <= SCROLL_HIDE_THRESHOLD;
  }

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  function tick() {
    const time = performance.now();
    const phaseSpeed = isReducedMotion.value ? 0 : WAVE_PHASE_SPEED;
    const driftAmp = isReducedMotion.value ? 0 : IDLE_DRIFT_AMPLITUDE;
    const idleX = driftAmp * Math.sin(time * IDLE_DRIFT_SPEED);
    const idleY = driftAmp * 0.6 * Math.sin(time * IDLE_DRIFT_SPEED * 1.1 + 1);
    const targetX = mouseX + idleX;
    const targetY = mouseY + idleY;
    currentX = lerp(currentX, targetX, SMOOTH);
    currentY = lerp(currentY, targetY, SMOOTH);
    currentSpeed = lerp(currentSpeed, 0, SPEED_SMOOTH);
    wavePhase.value = (wavePhase.value + phaseSpeed) % (Math.PI * 2);
    translateX.value = currentX;
    translateY.value = currentY;
    const amplitude =
      BASE_WAVE_AMPLITUDE + Math.min(MAX_WAVE_AMPLITUDE - BASE_WAVE_AMPLITUDE, currentSpeed * SPEED_TO_AMPLITUDE);
    waveAmplitude.value = amplitude;
    rafId = requestAnimationFrame(tick);
  }

  onMounted(() => {
    if (typeof window === "undefined") return;
    scrollY = window.scrollY;
    wavesVisible.value = scrollY <= SCROLL_HIDE_THRESHOLD;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafId = requestAnimationFrame(tick);
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("mousemove", onMouseMove);
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return {
    translateX,
    translateY,
    waveAmplitude,
    wavePhase,
    wavesVisible,
  };
}
