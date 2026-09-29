<!-- First impression, on every load (lib/entry.ts decides which):
     link — charcoal stage: a hairline draws out from the centre, the AJ mark rises out of it
            through a mask, then the line splits into a shutter that opens onto the hero, which
            settles from a slight zoom behind it (~2.5 s)
     qr   — round 8: a black QR (the shape the visitor just scanned) assembles from flying modules,
            holds, and dissolves; then the link entry above plays in full (QR_PRELUDE_MS + 2.5 s)
     fade — weak device/connection: a plain crossfade
     `open` fires the moment the page behind starts showing, so the hero can move with the shutter. -->
<template>
  <div
    v-if="!finished"
    class="entry"
    :class="[`entry--${kind === 'qr' ? 'link' : kind}`, `is-${phase}`, kind === 'qr' ? `qr-${qrPhase}` : '']"
    aria-hidden="true"
    @click="finish"
  >
    <div v-if="kind === 'qr' && qrPhase !== 'gone'" class="qr" :style="{ '--n': size }">
      <i
        v-for="cell in cells"
        :key="cell.key"
        :class="{ dark: cell.dark }"
        :style="{ '--dx': `${cell.dx}px`, '--dy': `${cell.dy}px`, '--d': `${cell.delay}ms` }"
      />
    </div>

    <template v-if="kind === 'link' || kind === 'qr'">
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
import { ENTRY_TIMING_MS, QR_PRELUDE_MS, type EntryKind } from "../lib/entry";

const props = defineProps<{ kind: EntryKind; skipLabel: string; kicker: string }>();
const emit = defineEmits<{ open: []; done: [] }>();

const size = 21;
const phase = ref<"start" | "form" | "open">("start");
/** the QR prelude, before the link entry: modules fly in → the code holds → it dissolves → gone */
const qrPhase = ref<"start" | "form" | "out" | "gone">("start");
const finished = ref(false);
let opened = false;
const timers: number[] = [];

const cells = computed(() => {
  const grid = qrPattern(size);
  const out: { key: string; dark: boolean; dx: number; dy: number; delay: number }[] = [];
  grid.forEach((row, r) =>
    row.forEach((dark, c) => {
      const angle = ((r * 31 + c * 17) % 360) * (Math.PI / 180);
      const dist = 240 + ((r * 13 + c * 7) % 160);
      out.push({
        key: `${r}-${c}`,
        dark,
        dx: Math.round(Math.cos(angle) * dist),
        dy: Math.round(Math.sin(angle) * dist),
        // a slow diagonal sweep: about 0.9 s from the first module to the last
        delay: (r + c) * 22,
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
  const nextPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  if (props.kind === "qr") {
    nextPaint(() => (qrPhase.value = "form"));
    at(QR_PRELUDE_MS - 650, () => (qrPhase.value = "out"));
    at(QR_PRELUDE_MS, () => {
      qrPhase.value = "gone";
      nextPaint(() => (phase.value = "form"));
    });
  } else {
    nextPaint(() => (phase.value = "form"));
  }
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

/* ---- qr prelude: a black QR on paper, above the (still closed) link entry ---- */
.qr {
  --cell: calc(min(60vmin, 400px) / var(--n));
  position: absolute;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(var(--n), var(--cell));
  transition:
    transform 0.65s var(--ajm-ease),
    opacity 0.55s ease;
}
.qr i {
  width: var(--cell);
  height: var(--cell);
  opacity: 0;
  transform: translate(var(--dx), var(--dy)) scale(0.3) rotate(25deg);
  transition:
    transform 0.9s var(--ajm-ease) var(--d),
    opacity 0.5s ease var(--d);
}
.qr i.dark {
  background: var(--ajm-ink);
}
.qr-form .qr i.dark {
  opacity: 1;
  transform: none;
}
/* dissolve: the code breathes out a little and fades, making room for the line and the mark */
.qr-out .qr {
  opacity: 0;
  transform: scale(1.08);
}
</style>
