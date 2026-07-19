<template>
  <canvas ref="canvasEl" class="fluid-cursor-trail" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import type { FluidSimulationHandle } from "../lib/fluidSimulation";

// Full WebGL fluid (Navier-Stokes) simulation — see fluidSimulation.ts. It's
// real shader/GPU work, so it's dynamic-imported and only initialized once
// we've confirmed the connection can actually afford the extra chunk: a fast
// Network Information API check first, then a race against a timeout on the
// import itself (covers browsers without that API, e.g. Safari/Firefox). On
// slow connections, in data-saver mode, or if the import doesn't land in
// time, the component just renders an empty canvas — no simulation, no
// dangling network wait blocking anything else on the page.
const IMPORT_TIMEOUT_MS = 2500;

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
}

const canvasEl = ref<HTMLCanvasElement | null>(null);
let handle: FluidSimulationHandle | null = null;

function hasSlowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g" || connection.effectiveType === "3g";
}

function timeout(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms));
}

onMounted(async () => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || hasSlowConnection() || !canvasEl.value) return;

  const outcome = await Promise.race([
    import("../lib/fluidSimulation").then((mod) => ({ mod }) as const),
    timeout(IMPORT_TIMEOUT_MS),
  ]);

  // Component may have unmounted (or the import may have simply been too
  // slow) while we were waiting — either way, don't initialize a simulation
  // nobody will see.
  if (outcome === "timeout" || !canvasEl.value) return;

  handle = outcome.mod.createFluidSimulation(canvasEl.value);
});

onBeforeUnmount(() => {
  handle?.destroy();
  handle = null;
});
</script>

<style scoped>
.fluid-cursor-trail {
  /* Fixed to the viewport, not the parent's box — the parent (.login-view)
     sits inset by the layout's own padding, so an absolutely-positioned
     canvas would leave a visible margin instead of covering the full green
     backdrop. */
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 0;
}
</style>
