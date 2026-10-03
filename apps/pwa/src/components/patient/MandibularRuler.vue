<template>
  <div class="mandibular-ruler">
    <div class="mandibular-ruler__track">
      <!-- Both incisors live in the track's own coordinate space (same
           left:% basis as the MR/MP/SP markers). Each image is shifted by
           its own tip offset (INCISOR_TIP), so the incisal TIP — not the
           image centre — sits on its position: with default values both
           tips touch the "0" line, as on OrthoApnea's own ruler. -->
      <img :src="incisorSup" alt="" class="mandibular-ruler__incisor mandibular-ruler__incisor--sup" :style="supStyle" />
      <div class="mandibular-ruler__ticks">
        <span v-for="n in 41" :key="n" class="mandibular-ruler__tick" :class="{ 'mandibular-ruler__tick--major': (n - 1) % 10 === 0 }" />
      </div>
      <div class="mandibular-ruler__marker-group" :style="{ left: mrPercent + '%' }">
        <span class="mandibular-ruler__marker-label">MR</span>
        <div class="mandibular-ruler__marker mandibular-ruler__marker--mr" title="MR" />
      </div>
      <div class="mandibular-ruler__marker-group" :style="{ left: mpPercent + '%' }">
        <span class="mandibular-ruler__marker-label">MP</span>
        <div class="mandibular-ruler__marker mandibular-ruler__marker--mp" title="MP" />
      </div>
      <!-- Only rendered once a real Starting Point value exists — showing a
           marker at dead-center by default (before the rep has entered
           anything) would falsely imply "SP = 0" instead of "not set yet". -->
      <div v-if="spSet" class="mandibular-ruler__marker mandibular-ruler__marker--sp" :style="{ left: spPercent + '%' }" title="SP" />
      <img :src="incisorInf" alt="" class="mandibular-ruler__incisor mandibular-ruler__incisor--inf" :style="infStyle" />
    </div>
    <div class="mandibular-ruler__scale">
      <span>-2cm</span>
      <span>0</span>
      <span>2cm</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { INCISOR_TIP, incisorStyle, rulerPercent } from "./mandibularRuler";

/**
 * Replica of OrthoApnea's own "app-mandibular-advancement" ruler: a -2cm/+2cm
 * scale with MR/MP/SP markers and incisor graphics (downloaded — see
 * assets/orthoapnea/teeth/). ±20mm maps to the ruler's full width.
 *
 * Upper incisor (sup) stays fixed with its tip on 0 — it's the reference
 * point, same convention as DeviationDiagram's fixed upper arch. Only the
 * lower incisor (inf) moves, its tip tracking the Starting Point in mm (null
 * = not set yet = resting on 0). The images are positioned by their incisal
 * tip, not their centre (Łukasz, 2026-10-03: OA's tips touch the 0 line, ours
 * sat centred on it). MR/MP carry small vertical text labels.
 */
const props = defineProps<{
  retrusionMax: number | null;
  protrusionMax: number | null;
  /** SP already converted to mm (startingPointMm from @device-order), or null when not entered. */
  startingPointMm: number | null;
}>();

const incisorSup = new URL("../../assets/orthoapnea/teeth/incisor-sup.png", import.meta.url).href;
const incisorInf = new URL("../../assets/orthoapnea/teeth/incisor-inf.png", import.meta.url).href;

const mrPercent = computed(() => rulerPercent(props.retrusionMax ?? 0));
const mpPercent = computed(() => rulerPercent(props.protrusionMax ?? 0));
const spSet = computed(() => props.startingPointMm != null);
const spPercent = computed(() => rulerPercent(props.startingPointMm ?? 0));
const supStyle = computed(() => incisorStyle(rulerPercent(0), INCISOR_TIP.sup));
const infStyle = computed(() => incisorStyle(spPercent.value, INCISOR_TIP.inf));
</script>

<style scoped>
.mandibular-ruler {
  position: relative;
  width: 60%;
  margin: 0 auto 0 0;
  padding-top: 44px;
  padding-bottom: 8px;
}

.mandibular-ruler__track {
  position: relative;
  height: 2px;
  background: rgba(var(--v-theme-on-surface), 0.3);
  margin: 0 8px;
}

.mandibular-ruler__ticks {
  position: absolute;
  inset: -6px 0 auto 0;
  display: flex;
  justify-content: space-between;
}

.mandibular-ruler__tick {
  width: 1px;
  height: 6px;
  background: rgba(var(--v-theme-on-surface), 0.25);
}

.mandibular-ruler__tick--major {
  height: 10px;
  background: rgba(var(--v-theme-on-surface), 0.5);
}

.mandibular-ruler__marker-group {
  position: absolute;
  top: -19px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: left 0.15s ease;
}

.mandibular-ruler__marker-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  font-size: 0.5625rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.02em;
  color: rgb(var(--v-theme-primary));
  margin-bottom: 1px;
}

.mandibular-ruler__marker {
  position: absolute;
  top: -5px;
  width: 2px;
  height: 12px;
  transform: translateX(-50%);
  transition: left 0.15s ease;
}

.mandibular-ruler__marker-group .mandibular-ruler__marker {
  position: static;
  transform: none;
}

.mandibular-ruler__marker--mr,
.mandibular-ruler__marker--mp {
  background: rgb(var(--v-theme-error));
}

.mandibular-ruler__marker--sp {
  background: rgb(var(--v-theme-primary));
  width: 3px;
}

/* Size and translate come from incisorStyle() (mandibularRuler.ts) — the
   tip offset is a fraction of the image's own box, so it holds at any size. */
.mandibular-ruler__incisor {
  position: absolute;
  transition: left 0.15s ease;
}

/* Tips touch the track: the upper image's bottom edge on its top, the lower
   image's top edge on its bottom (the tips sit on those edges, see INCISOR_TIP). */
.mandibular-ruler__incisor--sup {
  bottom: 100%;
}

.mandibular-ruler__incisor--inf {
  top: 100%;
}

.mandibular-ruler__scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  /* Clears the --inf incisor image (~29px tall, right under the track). */
  margin-top: 34px;
}
</style>
