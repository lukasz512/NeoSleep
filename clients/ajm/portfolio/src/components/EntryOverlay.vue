<!-- First impression, on every load (lib/entry.ts decides which):
     link — charcoal stage: a hairline draws out from the centre, the AJ mark rises out of it
            through a mask, then the line splits into a shutter that opens onto the hero, which
            settles from a slight zoom behind it (~2.5 s)
     qr   — squares fly in and form the QR the visitor scanned; its dark modules are slices of one
            photo, then the light ones fill in too and the mosaic opens into the hero (~2.1 s)
     fade — weak device/connection: a plain crossfade
     `open` fires the moment the page behind starts showing, so the hero can move with the shutter. -->
<template>
  <div
    v-if="!finished"
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
      <div class="shutter shutter--top"><div class="shutter__edge" /></div>
      <div class="shutter shutter--bottom"><div class="shutter__edge" /></div>
      <div class="stage">
        <div class="stage__mask">
          <div class="stage__mark"><AjLogo label="AJ Management" /></div>
        </div>
        <div class="stage__line" />
        <p class="stage__kicker">{{ kicker }}</p>
      </div>
    </template>

    <button type="button" class="entry__skip" @click.stop="finish">{{ skipLabel }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AjLogo from "./AjLogo.vue";
import { qrPattern } from "../lib/qr";
import { ENTRY_TIMING_MS, type EntryKind } from "../lib/entry";

const props = defineProps<{ kind: EntryKind; photo: string; skipLabel: string; kicker: string }>();
const emit = defineEmits<{ open: []; done: [] }>();

const size = 21;
const phase = ref<"start" | "form" | "fill" | "open">("start");
const finished = ref(false);
let opened = false;
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

function open() {
  if (opened) return;
  opened = true;
  phase.value = "open";
  emit("open");
}

function finish() {
  if (finished.value) return;
  open();
  finished.value = true;
  timers.forEach((t) => window.clearTimeout(t));
  emit("done");
}

function at(ms: number, fn: () => void) {
  timers.push(window.setTimeout(fn, ms));
}

onMounted(() => {
  const timing = ENTRY_TIMING_MS[props.kind];
  // double rAF so the "start" state paints before transitions begin
  requestAnimationFrame(() => requestAnimationFrame(() => (phase.value = "form")));
  if (props.kind === "qr") at(950, () => (phase.value = "fill"));
  at(timing.open, open);
  at(timing.done, finish);
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
  transition: background-color 0.5s ease, opacity 0.45s ease;
}
.entry__skip {
  position: absolute;
  right: var(--ajm-gutter);
  bottom: calc(24px + env(safe-area-inset-bottom));
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  background: none;
  border: 0;
  color: var(--ajm-muted);
  cursor: pointer;
  padding: 8px;
  z-index: 2;
  transition: opacity 0.3s ease;
}
.entry--qr .entry__skip,
.entry--fade .entry__skip {
  color: var(--ajm-muted);
}
.is-open .entry__skip {
  opacity: 0;
}

/* ---- fade ---- */
.entry--fade {
  background: var(--ajm-paper);
}
.entry--fade.is-open {
  opacity: 0;
}

/* ---- link: charcoal stage → hairline → mark → shutter ---- */
.entry--link {
  background: transparent;
}
.shutter {
  position: absolute;
  left: 0;
  right: 0;
  height: 50.5%;
  background: var(--ajm-paper);
  transition: transform 1s cubic-bezier(0.83, 0, 0.17, 1);
}
.shutter--top {
  top: 0;
}
.shutter--bottom {
  bottom: 0;
}
/* the hairline travels with each shutter edge, so the line itself is what opens */
.shutter__edge {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: color-mix(in srgb, var(--ajm-ink) 40%, transparent);
  opacity: 0;
  transition: opacity 0.2s ease;
}
.shutter--top .shutter__edge {
  bottom: 0;
}
.shutter--bottom .shutter__edge {
  top: 0;
}
.stage {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 18px;
  color: var(--ajm-ink);
  transition: opacity 0.35s ease, transform 1s cubic-bezier(0.83, 0, 0.17, 1);
}
.stage__mask {
  overflow: hidden;
  padding: 0 4px;
}
.stage__mark {
  height: clamp(44px, 9vw, 72px);
  transform: translateY(110%);
  transition: transform 0.9s var(--ajm-ease) 0.35s;
}
.stage__mark :deep(svg) {
  height: 100%;
  width: auto;
}
.stage__line {
  width: min(56vw, 440px);
  height: 1px;
  background: color-mix(in srgb, var(--ajm-ink) 70%, transparent);
  transform: scaleX(0);
  transition: transform 0.7s var(--ajm-ease);
}
.stage__kicker {
  margin: 0;
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--ajm-muted);
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 0.6s ease 0.8s, transform 0.8s var(--ajm-ease) 0.8s, letter-spacing 1.4s var(--ajm-ease) 0.6s;
}
.is-form .stage__line {
  transform: scaleX(1);
}
.is-form .stage__mark {
  transform: none;
}
.is-form .stage__kicker {
  opacity: 1;
  transform: none;
  letter-spacing: 0.22em;
}
/* open: the centre line becomes the shutter edges, the mark lifts away, the halves part */
.is-open .stage {
  opacity: 0;
  transform: translateY(-3vh) scale(0.96);
  transition-duration: 0.35s, 1s;
}
.is-open .shutter__edge {
  opacity: 1;
}
.is-open .shutter--top {
  transform: translateY(-101%);
}
.is-open .shutter--bottom {
  transform: translateY(101%);
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
</style>
