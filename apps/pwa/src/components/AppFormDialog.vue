<template>
  <VDialog
    :model-value="modelValue"
    :max-width="maxWidth"
    :persistent="persistent"
    scrollable
    :class="['pwa-form-dialog', { 'pwa-form-dialog--sheet': asSheet }]"
    content-class="pwa-form-dialog__content"
    :transition="asSheet ? sheetDialogTransition : originDialogTransition"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <VCard
      class="pwa-form-dialog__card"
      :class="{ 'pwa-form-dialog__card--folder': asFolder }"
      data-testid="app-form-dialog"
    >
      <!-- NEO-92 "Carpeta": the folder's spine (record identity + section
           index), a left column beside header/body/actions. Not on phones. -->
      <aside v-if="asFolder" class="pwa-form-dialog__spine" data-testid="app-form-dialog-spine">
        <slot name="spine" />
      </aside>
      <AppDialogHeader
        v-if="title"
        :title="title"
        :avatar-entity-type="asFolder ? undefined : avatarEntityType"
        :avatar-name="avatarName"
        :avatar-first-name="avatarFirstName"
        :avatar-last-name="avatarLastName"
        :closable="closable"
        @close="emit('close')"
      />
      <slot name="header-extra" />
      <VCardText
        ref="bodyRef"
        class="pwa-form-dialog__body"
        :class="{ 'pwa-form-dialog__body--scrolled': scrolled, 'pwa-form-dialog__body--more': hasMore }"
        data-testid="app-form-dialog-body"
        @scroll.passive="measure"
      >
        <div ref="innerRef" class="pwa-form-dialog__body-inner">
          <slot />
        </div>
      </VCardText>
      <VCardActions v-if="$slots.actions" class="pwa-form-dialog__actions">
        <slot name="actions" />
      </VCardActions>
    </VCard>
    <!-- Nested dialogs (e.g. an AppConfirmDialog for discard-changes); they
         teleport to the overlay container, this only keeps them scoped. -->
    <slot name="overlays" />
  </VDialog>
</template>

<script setup lang="ts">
/**
 * The one shell for every form-style dialog in the PWA (entity create/edit via
 * FormRenderer, EventForm, the OrthoApnea wizard and transaction log, the
 * clinical questionnaire/upload/QR dialogs, ...). Header and actions stay
 * pinned; only the body between them scrolls, so a form taller than the
 * screen is always reachable and its Save button always visible.
 *
 * Why a component and not per-dialog markup: "the form doesn't scroll" came
 * back more than once, each time because one hand-built dialog missed a piece
 * (no `scrollable`, an `overflow: hidden` on the card, a local max-height
 * hack). On Vuetify 4 every Vuetify rule lives in a cascade layer, so any
 * unlayered app CSS on the card silently beats Vuetify's own
 * `overflow-y: auto` — which is exactly how all form dialogs lost scrolling
 * after the Vuetify 4 upgrade. The scroll model is now owned here plus the
 * `.pwa-form-dialog*` rules in assets/theme.scss, and nowhere else.
 * Guarded by AppFormDialog.spec.ts (no raw VDialog outside the shells) and
 * e2e/dialog-scroll.spec.ts (real-browser scrolling, all engines).
 *
 * On phone widths it is a bottom sheet (sheetDialogTransition, theme.scss
 * `.pwa-form-dialog--sheet`); elsewhere it grows from the tapped element.
 *
 * The body also exposes whether it is scrolled / has more below, which draws
 * M3's hairline dividers under the header and above the actions only while
 * content actually runs behind them.
 */
import { computed, onBeforeUnmount, ref, useSlots, watch } from "vue";
import { useDisplay } from "vuetify";
import { VCardText } from "vuetify/components";
import { originDialogTransition, sheetDialogTransition } from "@ui";
import AppDialogHeader from "./AppDialogHeader.vue";
import type { AppAvatarEntityType } from "./AppAvatar.vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Omit only for dialogs that draw their own header (none today). */
    title?: string;
    avatarEntityType?: AppAvatarEntityType;
    avatarName?: string;
    avatarFirstName?: string;
    avatarLastName?: string;
    closable?: boolean;
    persistent?: boolean;
    maxWidth?: number | string;
    /**
     * The folder layout (NEO-92) when a `spine` slot is given: a left spine
     * column beside the page. Desktop only (≥ 960px): on tablets (a tile)
     * and phones (a bottom sheet) the caller puts a compact index in
     * `header-extra` instead.
     */
    folder?: boolean;
  }>(),
  {
    title: undefined,
    avatarEntityType: undefined,
    avatarName: "",
    avatarFirstName: "",
    avatarLastName: "",
    closable: true,
    persistent: false,
    maxWidth: 680,
    folder: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  /** The header's X — callers decide (e.g. ask to discard unsaved changes). */
  close: [];
  /** The body scrolled or resized — the folder's section index follows it. */
  "body-scroll": [el: HTMLElement];
}>();

// Phones (< 600px, Vuetify xs): an M3 bottom sheet sliding up from the screen
// edge, within thumb reach, instead of a centred card (NEO-85).
const { xs: asSheet, mdAndUp } = useDisplay();
const slots = useSlots();
// The spine needs room beside the page: desktop only (≥ 960px). Tablets keep
// the single tile and phones the bottom sheet; both show the index as chips.
const asFolder = computed(() => props.folder && mdAndUp.value && !!slots.spine);

const bodyRef = ref<InstanceType<typeof VCardText> | null>(null);
const innerRef = ref<HTMLElement | null>(null);
const scrolled = ref(false);
const hasMore = ref(false);

function bodyEl(): HTMLElement | null {
  const el: unknown = bodyRef.value?.$el;
  return el instanceof HTMLElement ? el : null;
}

function measure() {
  const el = bodyEl();
  if (!el) return;
  scrolled.value = el.scrollTop > 0;
  hasMore.value = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  emit("body-scroll", el);
}

// The body's own box is fixed by the flex layout; what changes is the content
// inside it (async option lists, a wizard step switch, a validation message)
// and the viewport — observe both, since neither fires a scroll event.
// VDialog renders its content lazily, so start observing when the inner
// wrapper actually mounts, not when modelValue flips.
let observer: ResizeObserver | null = null;
watch(innerRef, (inner) => {
  observer?.disconnect();
  observer = null;
  const el = bodyEl();
  if (!inner || !el || typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(measure);
  observer.observe(el);
  observer.observe(inner);
  measure();
});

onBeforeUnmount(() => observer?.disconnect());

defineExpose({ bodyEl, measure });
</script>
