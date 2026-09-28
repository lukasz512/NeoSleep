<!-- First impression, once per session (lib/entry.ts decides which):
     qr   — squares fly in and form the QR the visitor scanned; its dark modules are slices of the
            hero photo, then the light ones fill in too and the mosaic opens into the hero (~2 s)
     link — a thin line draws, the AJ mark tightens in, the page opens along the line (~1.5 s)
     fade — weak device/connection: a plain crossfade -->
<template>
  <div
    v-if="kind !== 'none' && !finished"
    class="entry"
    :class="[`entry--${kind}`, `is-${phase}`]"
    aria-hidden="true"
    @click="finish"
  >
    <template v-if="kind === 'qr'">
      <div class="qr" :style="{ '--n': size }">
        <i
          v-for="cell in cells"
          :key="cell.key"
          :class="{ dark: cell.dark }"
          :style="{
            '--dx': `${cell.dx}px`,
            '--dy': `${cell.dy}px`,
            '--d': `${cell.delay}ms`,
            '--img': `url(${photo})`,
            backgroundPosition: `${cell.px}% ${cell.py}%`,
          }"
        />
      </div>
    </template>

    <template v-else-if="kind === 'link'">
      <div class="half half--top" />
      <div class="half half--bottom" />
      <div class="line" />
      <div class="mark"><AjLogo :label="'AJ Management'" /></div>
    </template>

    <button type="button" class="entry__skip" @click.stop="finish">{{ skipLabel }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AjLogo from "./AjLogo.vue";
import { qrPattern } from "../lib/qr";
import { ENTRY_DURATION_MS, type EntryKind } from "../lib/entry";

const props = defineProps<{ kind: EntryKind; photo: string; skipLabel: string }>();
const emit = defineEmits<{ done: [] }>();

const size = 21;
const phase = ref<"start" | "form" | "fill" | "open">("start");
const finished = ref(false);
const timers: number[] = [];

const cells = computed(() => {
  const grid = qrPattern(size);
  const out: { key: string; dark: boolean; dx: number; dy: number; delay: number; px: number; py: number }[] = [];
  grid.forEach((row, r) =>
    row.forEach((dark, c) => {
      const angle = ((r * 31 + c * 17) % 360) * (Math.PI / 180);
      const dist = 240 + ((r * 13 + c * 7) % 160);
      out.push({
        key: `${r}-${c}`,
        dark,
        dx: Math.round(Math.cos(angle) * dist),
        dy: Math.round(Math.sin(angle) * dist),
        delay: (r + c) * 12,
        px: (c / (size - 1)) * 100,
        py: (r / (size - 1)) * 100,
      });
    }),
  );
  return out;
});

function finish() {
  if (finished.value) return;
  finished.value = true;
  timers.forEach((t) => window.clearTimeout(t));
  emit("done");
}

function at(ms: number, fn: () => void) {
  timers.push(window.setTimeout(fn, ms));
}

onMounted(() => {
  if (props.kind === "none") {
    finish();
    return;
  }
  // double rAF so the "start" state paints before transitions begin
  requestAnimationFrame(() => requestAnimationFrame(() => (phase.value = "form")));
  if (props.kind === "qr") {
    at(950, () => (phase.value = "fill"));
    at(1450, () => (phase.value = "open"));
  } else if (props.kind === "link") {
    at(800, () => (phase.value = "open"));
  } else {
    phase.value = "open";
  }
  at(ENTRY_DURATION_MS[props.kind], finish);
});

onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)));
</script>

<style scoped>
.entry {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: var(--ajm-paper);
  transition: background-color 0.5s ease, opacity 0.5s ease;
}
.entry__skip {
  position: absolute;
  right: var(--ajm-gutter);
  bottom: calc(24px + env(safe-area-inset-bottom));
  font: 500 12px var(--ajm-font);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  background: none;
  border: 0;
  color: var(--ajm-muted);
  cursor: pointer;
  padding: 8px;
}

/* ---- fade ---- */
.entry--fade.is-open {
  opacity: 0;
}

/* ---- qr ---- */
.qr {
  --cell: calc(min(64vmin, 420px) / var(--n));
  display: grid;
  grid-template-columns: repeat(var(--n), var(--cell));
  gap: 1px;
  transition: transform 0.55s var(--ajm-ease), gap 0.4s ease;
}
.qr i {
  width: var(--cell);
  height: var(--cell);
  background-size: calc(var(--n) * 100%) calc(var(--n) * 100%);
  background-color: var(--ajm-paper);
  background-image: var(--img);
  opacity: 0;
  transform: translate(var(--dx), var(--dy)) scale(0.4);
  transition:
    transform 0.7s var(--ajm-ease) var(--d),
    opacity 0.4s ease var(--d);
}
/* only the dark modules show during "form" (a QR on paper); the light ones join on "fill" */
.is-form .qr i.dark,
.is-fill .qr i,
.is-open .qr i {
  opacity: 1;
  transform: none;
}
.is-fill .qr,
.is-open .qr {
  gap: 0;
}
.entry--qr.is-open {
  background-color: transparent;
}
.entry--qr.is-open .qr {
  transform: scale(4);
}
.entry--qr.is-open .qr i {
  opacity: 0;
  transition:
    transform 0.6s var(--ajm-ease),
    opacity 0.6s ease 0.1s;
}

/* ---- link ---- */
.entry--link {
  background: transparent;
}
.half {
  position: absolute;
  left: 0;
  right: 0;
  height: 50%;
  background: var(--ajm-paper);
  transition: transform 0.7s var(--ajm-ease);
}
.half--top {
  top: 0;
}
.half--bottom {
  bottom: 0;
}
.line {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(60vw, 520px);
  height: 1px;
  background: var(--ajm-ink);
  transform: translateX(-50%) scaleX(0);
  transition: transform 0.6s var(--ajm-ease), opacity 0.3s ease;
}
.mark {
  position: absolute;
  top: calc(50% - 64px);
  left: 50%;
  height: 48px;
  color: var(--ajm-ink);
  transform: translateX(-50%);
  opacity: 0;
  letter-spacing: 0.4em;
  transition: opacity 0.5s ease 0.25s;
}
.is-form .line {
  transform: translateX(-50%) scaleX(1);
}
.is-form .mark {
  opacity: 1;
}
.is-open .half--top {
  transform: translateY(-100%);
}
.is-open .half--bottom {
  transform: translateY(100%);
}
.is-open .line,
.is-open .mark {
  opacity: 0;
  transition-delay: 0s;
}
</style>
