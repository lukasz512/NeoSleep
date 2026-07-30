<template>
  <div class="signature-pad">
    <div ref="wrapperRef" class="signature-pad__canvas-wrap">
      <canvas ref="canvasRef" class="signature-pad__canvas" />
      <span v-if="isEmpty" class="signature-pad__placeholder">{{ placeholder }}</span>
    </div>
    <div class="signature-pad__actions">
      <AppButton variant="text" size="small" @click="clear">{{ clearLabel }}</AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from "vue";
import SignaturePadLib from "signature_pad";
import AppButton from "./AppButton.vue";

/**
 * Thin wrapper around the `signature_pad` library — captures a handwritten
 * signature (mouse/touch/pen) as a PNG data URL, used by
 * PartnerRegistrationView.vue before submitting the GDPR/partner-agreement
 * documents. Imperative API (isEmpty/clear/toDataURL) via defineExpose,
 * matching how VForm.validate() is called elsewhere in this codebase — the
 * parent decides when to read the signature (on submit), not on every stroke.
 */

defineProps<{
  placeholder?: string;
  clearLabel: string;
}>();

const wrapperRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const pad = shallowRef<SignaturePadLib | null>(null);
const isEmpty = ref(true);

function resizeCanvas() {
  const canvas = canvasRef.value;
  const wrapper = wrapperRef.value;
  if (!canvas || !wrapper) return;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const { width, height } = wrapper.getBoundingClientRect();
  if (width === 0 || height === 0) return;
  const data = pad.value && !pad.value.isEmpty() ? pad.value.toData() : null;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.getContext("2d")?.scale(ratio, ratio);
  if (data && pad.value) pad.value.fromData(data);
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas || !canvas.getContext("2d")) return; // defensive: jsdom/test env stubs getContext to null
  pad.value = new SignaturePadLib(canvas, { backgroundColor: "rgba(255,255,255,0)" });
  pad.value.addEventListener("endStroke", () => {
    isEmpty.value = pad.value?.isEmpty() ?? true;
  });
  resizeCanvas();
  resizeObserver = new ResizeObserver(resizeCanvas);
  if (wrapperRef.value) resizeObserver.observe(wrapperRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  pad.value?.off();
});

function clear() {
  pad.value?.clear();
  isEmpty.value = true;
}

function toDataURL(): string | null {
  if (!pad.value || pad.value.isEmpty()) return null;
  return pad.value.toDataURL("image/png");
}

/** Exposed as a plain function (not the raw ref) so callers get a real boolean, not a Ref to unwrap. */
function isEmptyValue(): boolean {
  return isEmpty.value;
}

defineExpose({ isEmpty: isEmptyValue, clear, toDataURL });
</script>

<style scoped>
.signature-pad {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signature-pad__canvas-wrap {
  position: relative;
  width: 100%;
  height: 160px;
  border: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--pwa-radius, 8px);
  background: rgba(var(--v-theme-surface), 1);
  touch-action: none;
}

.signature-pad__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.signature-pad__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
  font-size: 0.875rem;
  pointer-events: none;
}

.signature-pad__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
