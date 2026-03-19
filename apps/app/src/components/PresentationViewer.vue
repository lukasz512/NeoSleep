<template>
  <VDialog
    :model-value="modelValue"
    fullscreen
    transition="dialog-bottom-transition"
    class="presentation-viewer"
    persistent
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div ref="containerRef" class="presentation-viewer__container" :class="{ 'presentation-viewer__container--rotated': shouldRotate }">
      <div class="presentation-viewer__toolbar">
        <VBtn icon variant="text" :title="t('rep.presentations.close')" :aria-label="t('rep.presentations.close')" @click="$emit('update:modelValue', false)">
          <VIcon icon="mdi-close" />
        </VBtn>
        <span class="presentation-viewer__title">{{ presentation?.title }}</span>
        <VBtn
          v-if="presentation?.file_type === 'pdf'"
          icon
          variant="text"
          :title="t('rep.presentations.rotate')"
          :aria-label="t('rep.presentations.rotate')"
          @click="toggleRotate"
        >
          <VIcon icon="mdi-rotate-right" />
        </VBtn>
      </div>
      <div class="presentation-viewer__content">
        <iframe
          v-if="presentation?.file_type === 'pdf'"
          :src="pdfUrl"
          class="presentation-viewer__iframe"
          title="PDF viewer"
        />
        <iframe
          v-else-if="presentation?.file_type === 'pptx'"
          :src="pptxViewerUrl"
          class="presentation-viewer__iframe"
          title="PPTX viewer"
        />
      </div>
    </div>
  </VDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";

export interface Presentation {
  id: string;
  title: string;
  url: string;
  file_type: string;
}

const props = defineProps<{
  modelValue: boolean;
  presentation: Presentation | null;
}>();

defineEmits<{
  "update:modelValue": [value: boolean];
}>();

const { t } = useI18n();
const containerRef = ref<HTMLElement | null>(null);
const manualRotate = ref(false);
const isPortrait = ref(false);

const pdfUrl = computed(() => props.presentation?.url ?? "");
const pptxViewerUrl = computed(() => {
  const url = props.presentation?.url;
  if (!url) return "";
  return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
});

/** When fullscreen and portrait (height > width), rotate. User can also toggle manually for PDF. */
const shouldRotate = computed(() => {
  if (props.presentation?.file_type !== "pdf") return false;
  if (manualRotate.value) return true;
  return isPortrait.value;
});

function updatePortrait() {
  const el = containerRef.value;
  if (!el) {
    isPortrait.value = window.innerHeight > window.innerWidth;
    return;
  }
  const rect = el.getBoundingClientRect();
  isPortrait.value = rect.height > rect.width;
}

function toggleRotate() {
  manualRotate.value = !manualRotate.value;
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) manualRotate.value = false;
    if (open) updatePortrait();
  }
);

onMounted(() => {
  window.addEventListener("resize", updatePortrait);
  if (props.modelValue) updatePortrait();
});

onUnmounted(() => {
  window.removeEventListener("resize", updatePortrait);
});
</script>

<style scoped>
.presentation-viewer__container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #1a1a1a;

  &--rotated {
    .presentation-viewer__content {
      transform: rotate(90deg);
      transform-origin: center center;
      width: 100vh;
      height: 100vw;
      position: absolute;
      top: 50%;
      left: 50%;
      margin-top: -50vw;
      margin-left: -50vh;
    }
  }
}

.presentation-viewer__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  background: #2a2a2a;
  flex-shrink: 0;
}

.presentation-viewer__title {
  flex: 1;
  color: #fff;
  font-size: 0.9375rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presentation-viewer__content {
  flex: 1;
  min-height: 0;
  position: relative;
}

.presentation-viewer__iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}
</style>
