<template>
  <div class="signature-pad">
    <div ref="wrapperRef" class="signature-pad__canvas-wrap">
      <canvas ref="canvasRef" class="signature-pad__canvas" />
      <span v-if="isEmpty" class="signature-pad__placeholder">{{ placeholder }}</span>
      <AppButton
        v-if="clearPlacement === 'overlay'"
        variant="outlined"
        size="small"
        class="signature-pad__clear-overlay"
        :disabled="isEmpty"
        @click="clear"
      >
        <template #prepend><AppIcon name="close" /></template>
        {{ clearLabel }}
      </AppButton>
    </div>
    <div v-if="clearPlacement !== 'overlay'" class="signature-pad__actions">
      <AppButton variant="text" size="small" @click="clear">{{ clearLabel }}</AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, shallowRef } from "vue";
import SignaturePadLib from "signature_pad";
import AppButton from "./AppButton.vue";
import AppIcon from "./AppIcon.vue";

/**
 * Thin wrapper around the `signature_pad` library — captures a handwritten
 * signature (mouse/touch/pen) as a PNG data URL, used by
 * PartnerRegistrationView.vue before submitting the GDPR/partner-agreement
 * documents. Imperative API (isEmpty/clear/toDataURL) via defineExpose,
 * matching how VForm.validate() is called elsewhere in this codebase — the
 * parent decides when to read the signature (on submit), not on every stroke.
 */

const { clearPlacement = "below" } = defineProps<{
  placeholder?: string;
  clearLabel: string;
  /** "overlay" puts Clear on the pad's own top-right corner, right where the signer is looking (NEO-51). */
  clearPlacement?: "below" | "overlay";
}>();

/** Fires whenever the pad goes from empty to signed or back — lets a parent enable/disable its own "Sign" action. */
const emit = defineEmits<{ change: [empty: boolean] }>();

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
    emit("change", isEmpty.value);
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
  emit("change", true);
}

/** Transparent margin kept around a trimmed signature, in device pixels. */
const TRIM_MARGIN = 8;

/**
 * Crops the canvas to the drawn strokes (plus a small margin). Without this
 * the PNG carries all the empty pad around the ink, so a document can't
 * centre the signature over its line — it would centre the whole pad.
 */
function trimmedDataURL(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  const alpha = ctx.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  left = Math.max(0, left - TRIM_MARGIN);
  top = Math.max(0, top - TRIM_MARGIN);
  right = Math.min(width - 1, right + TRIM_MARGIN);
  bottom = Math.min(height - 1, bottom + TRIM_MARGIN);
  const out = document.createElement("canvas");
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  out.getContext("2d")?.drawImage(canvas, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** `trim: true` returns only the inked area (NEO-51 agreement signature); the default keeps the whole pad. */
function toDataURL(options: { trim?: boolean } = {}): string | null {
  if (!pad.value || pad.value.isEmpty()) return null;
  if (options.trim && canvasRef.value) return trimmedDataURL(canvasRef.value) ?? pad.value.toDataURL("image/png");
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

.signature-pad__clear-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  background: rgba(var(--v-theme-surface), 1);
  text-transform: none;
  letter-spacing: normal;
}
</style>
