<template>
  <div class="teeth-diagram">
    <!-- Scrolls horizontally on its own — teeth are sized for legibility
         first, not to force-fit the dialog/mobile viewport width. Both rows
         share one scroll container so the upper/lower arches stay aligned
         while scrolling. -->
    <div class="teeth-diagram__rows">
      <div class="teeth-diagram__row">
        <button
          v-for="tooth in UPPER_TEETH"
          :key="tooth"
          type="button"
          class="teeth-diagram__tooth"
          :class="{ 'teeth-diagram__tooth--relieved': relieved.has(tooth) }"
          :title="tooth"
          :aria-label="tooth"
          @click="toggleTooth(tooth)"
        >
          <span class="teeth-diagram__img-wrap">
            <img :src="toothSrc(tooth)" :alt="tooth" class="teeth-diagram__img" />
            <span v-if="relieved.has(tooth)" class="teeth-diagram__fill" :style="fillStyle(tooth)" />
          </span>
        </button>
      </div>
      <div class="teeth-diagram__row">
        <button
          v-for="tooth in LOWER_TEETH"
          :key="tooth"
          type="button"
          class="teeth-diagram__tooth"
          :class="{ 'teeth-diagram__tooth--relieved': relieved.has(tooth) }"
          :title="tooth"
          :aria-label="tooth"
          @click="toggleTooth(tooth)"
        >
          <span class="teeth-diagram__img-wrap">
            <img :src="toothSrc(tooth)" :alt="tooth" class="teeth-diagram__img" />
            <span v-if="relieved.has(tooth)" class="teeth-diagram__fill" :style="fillStyle(tooth)" />
          </span>
        </button>
      </div>
    </div>

    <AppSegmentedTabs v-model="mode" :options="modeOptions" class="teeth-diagram__modes" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { AppSegmentedTabs } from "@ui";

/**
 * Replica of OrthoApnea's own "app-teeth-status" component (FDI numbering,
 * per-tooth Normal/Aliviar toggle) — using their actual tooth PNGs, saved
 * locally under assets/orthoapnea/teeth/ (publicly served static files on
 * apneadock.com, not behind their auth — see that folder for provenance).
 */

const UPPER_TEETH = ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"];
const LOWER_TEETH = ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"];

const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const { t } = useI18n();
const mode = ref<"normal" | "relieve">("relieve");

const modeOptions = computed(() => [
  { value: "normal", label: t("app.orthoApneaOrder.form.toothNormal") },
  { value: "relieve", label: t("app.orthoApneaOrder.form.toothRelieve") },
]);

const relieved = computed(() => new Set(props.modelValue));

function toothSrc(tooth: string): string {
  return new URL(`../../assets/orthoapnea/teeth/tooth${tooth}.png`, import.meta.url).href;
}

/**
 * The downloaded tooth PNGs are opaque line art (white canvas, no
 * transparency) — there's no alpha channel to mask a fill through. The
 * `-fill.png` siblings are generated interior masks (flood-filled from the
 * canvas border, stopping at the drawn outline) so a relieved tooth's color
 * lands only inside the crown, matching OrthoApnea's own solid-fill look
 * instead of a rectangular color wash behind the whole glyph.
 */
function toothFillSrc(tooth: string): string {
  return new URL(`../../assets/orthoapnea/teeth/tooth${tooth}-fill.png`, import.meta.url).href;
}

function fillStyle(tooth: string) {
  const url = `url(${toothFillSrc(tooth)})`;
  return {
    maskImage: url,
    WebkitMaskImage: url,
  };
}

function toggleTooth(tooth: string) {
  const next = new Set(props.modelValue);
  if (mode.value === "relieve") next.add(tooth);
  else next.delete(tooth);
  emit("update:modelValue", Array.from(next));
}
</script>

<style scoped>
.teeth-diagram {
  padding: 16px 0;
}

.teeth-diagram__rows {
  overflow-x: auto;
  padding-bottom: 2px;
}

.teeth-diagram__row {
  display: flex;
  gap: 0;
  justify-content: center;
  width: max-content;
  min-width: 100%;
  margin: 0 auto 2px;
}

/* Sized to always fit 16-across within the wizard dialog's own width (see
   .oa-wizard__section--centered) without needing the horizontal scroll
   fallback below — .teeth-diagram__rows keeps overflow-x:auto only as a
   safety net for unusually narrow viewports/zoom levels, not the normal case. */
.teeth-diagram__tooth {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.teeth-diagram__tooth--relieved {
  color: rgb(var(--v-theme-success));
}

.teeth-diagram__img-wrap {
  position: relative;
  display: block;
  width: 42px;
  height: 52px;
}

.teeth-diagram__img {
  width: 42px;
  height: 52px;
  object-fit: contain;
}

/* Interior-only fill (see toothFillSrc) — colors just the enclosed crown
   shape, not a rectangle behind the whole glyph. */
.teeth-diagram__fill {
  position: absolute;
  inset: 0;
  background: rgba(var(--v-theme-success), 0.3);
  mask-repeat: no-repeat;
  mask-position: center;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
  -webkit-mask-size: contain;
}

.teeth-diagram__modes {
  max-width: 260px;
  margin: 12px auto 0;
}
</style>
