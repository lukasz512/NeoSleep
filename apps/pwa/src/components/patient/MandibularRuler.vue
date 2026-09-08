<template>
  <div class="mandibular-ruler">
    <div class="mandibular-ruler__track">
      <!-- Both incisors are positioned in the track's own coordinate space
           (same left:%/toPercent() basis as the MR/MP/SP markers below,
           instead of the outer .mandibular-ruler box) — that's what
           guarantees the resting position (sup fixed, inf via spPercent's
           50% default) lands exactly on the "0" tick, not just close to it. -->
      <img :src="incisorSup" alt="" class="mandibular-ruler__incisor mandibular-ruler__incisor--sup" style="left: 50%" />
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
      <img :src="incisorInf" alt="" class="mandibular-ruler__incisor mandibular-ruler__incisor--inf" :style="{ left: spPercent + '%' }" />
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

/**
 * Replica of OrthoApnea's own "app-mandibular-advancement" ruler: a -2cm/+2cm
 * scale with MR/MP/SP markers and incisor graphics (downloaded — see
 * assets/orthoapnea/teeth/) that reposition as the underlying values change.
 * The exact value→position formula their Angular component uses internally
 * wasn't captured (only the visual concept + confirmed value examples) —
 * this maps ±20mm to the ruler's full width as a reasonable approximation,
 * not a verified match. Ruler width itself (60% of its container, see
 * .mandibular-ruler) matches the real site's more compact proportion.
 *
 * Upper incisor (sup) stays fixed at center — it's the reference point, same
 * convention as DeviationDiagram's fixed upper arch. Only the lower incisor
 * (inf) moves, tracking the actual configured position (SP) — an earlier
 * version bound sup/inf to mp/mr directly, which at extreme MR/MP values
 * sent the two images to opposite ends of the ruler instead of sitting near
 * each other at the current bite position.
 *
 * MR/MP get small vertical text labels above their tick marks — confirmed
 * from a live OA screenshot, previously missing here (the markers existed
 * but were unlabeled, only distinguishable by a hover title attribute).
 */
const props = defineProps<{
  retrusionMax: number | null;
  protrusionMax: number | null;
  startingPoint: number | null;
  startingPointPercent: number | null;
}>();

const incisorSup = new URL("../../assets/orthoapnea/teeth/incisor-sup.png", import.meta.url).href;
const incisorInf = new URL("../../assets/orthoapnea/teeth/incisor-inf.png", import.meta.url).href;

const RANGE_MM = 20;
function toPercent(mm: number): number {
  const clamped = Math.max(-RANGE_MM, Math.min(RANGE_MM, mm));
  return 50 + (clamped / RANGE_MM) * 50;
}

const mrPercent = computed(() => toPercent(props.retrusionMax ?? 0));
const mpPercent = computed(() => toPercent(props.protrusionMax ?? 0));
const spSet = computed(() => props.startingPoint != null || props.startingPointPercent != null);
const spPercent = computed(() => {
  if (props.startingPoint != null) return toPercent(props.startingPoint);
  if (props.startingPointPercent != null) {
    const mr = props.retrusionMax ?? 0;
    const mp = props.protrusionMax ?? 0;
    return toPercent(mr + (props.startingPointPercent / 100) * (mp - mr));
  }
  return 50;
});
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

.mandibular-ruler__incisor {
  position: absolute;
  width: 20px;
  transform: translateX(-50%);
  transition: left 0.15s ease;
}

/* -44px = the container's 44px padding-top, now measured from the track's
   own top edge (0) since this image lives inside .mandibular-ruler__track —
   keeps it visually right above the track, same spot as before the move. */
.mandibular-ruler__incisor--sup {
  top: -44px;
}

/* 10px clears the track (2px height) plus the tick marks/MR-MP marker
   labels, which only extend upward from the track — sits right below,
   mirroring how --sup sits right above. */
.mandibular-ruler__incisor--inf {
  top: 10px;
  height: 18px;
}

.mandibular-ruler__scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  /* Clears the --inf incisor image (top:54px + ~18px tall) with a small gap —
     22px previously put this row right under the track, overlapping the
     incisor once it moved below the track instead of above it. */
  margin-top: 34px;
}
</style>
