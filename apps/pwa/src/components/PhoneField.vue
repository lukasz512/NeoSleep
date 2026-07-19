<template>
  <div class="pwa-phone-field">
    <VCombobox
      :model-value="areaCode"
      class="pwa-phone-field__code"
      :items="AREA_CODES"
      item-title="label"
      item-value="code"
      :variant="variant"
      :density="density"
      hide-details
      hide-no-data
      menu-icon=""
      @update:model-value="onAreaCodeInput"
    >
      <template #prepend-inner>
        <FlagIcon v-if="currentFlagCountry" :country-code="currentFlagCountry" />
      </template>
      <template #item="{ item, props: itemProps }">
        <VListItem v-bind="itemProps" :title="undefined" class="pwa-phone-field__item">
          <template #prepend>
            <FlagIcon :country-code="item.raw.country" class="pwa-phone-field__item-flag" />
          </template>
          <VListItemTitle>{{ item.raw.label }}</VListItemTitle>
        </VListItem>
      </template>
    </VCombobox>
    <VTextField
      :model-value="localDigits"
      class="pwa-phone-field__number"
      type="tel"
      autocomplete="tel"
      :label="label"
      :placeholder="placeholder"
      :hint="hint"
      :persistent-hint="persistentHint"
      :rules="rules"
      :variant="variant"
      :density="density"
      @update:model-value="onLocalInput"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { parsePhone, formatPhone, countryCodeToAreaCode, PHONE_AREA_CODES } from "../utils/phone";
import FlagIcon from "./FlagIcon.vue";

/**
 * Compound area-code + local-number phone input, rendered by FormRenderer.vue
 * for `type: "phone"` fields. `modelValue` is the canonical stored string
 * "+<code> <digits>" (see utils/phone.ts) — this component owns splitting it
 * into (area code, local digits) for editing and recombining it on change.
 *
 * The area code is a VCombobox, not a VSelect: PHONE_AREA_CODES only lists
 * the 3 active/planned markets, but reps occasionally need to dial a number
 * in a country the tenant isn't operating in yet — the combobox offers those
 * 3 as one-click suggestions while still accepting any typed "+<code>".
 */

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label?: string;
    placeholder?: string;
    hint?: string;
    persistentHint?: boolean;
    rules?: ((v: unknown) => true | string)[];
    variant?: string;
    density?: string;
  }>(),
  { modelValue: "" },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const AREA_CODES = PHONE_AREA_CODES.map((c) => ({ code: c.code, label: c.code, country: c.country }));

const authStore = useAuthStore();

const initial = parsePhone(props.modelValue, countryCodeToAreaCode(authStore.user?.country_code));
const areaCode = ref(initial.areaCode);
const localDigits = ref(initial.local);

// External changes (dialog re-open onto different initialData) re-parse —
// guarded by comparing against what we'd emit ourselves, so our own emits
// below don't bounce back into a redundant re-parse.
watch(
  () => props.modelValue,
  (v) => {
    if (v === formatPhone(areaCode.value, localDigits.value)) return;
    const parsed = parsePhone(v, countryCodeToAreaCode(authStore.user?.country_code));
    areaCode.value = parsed.areaCode;
    localDigits.value = parsed.local;
  },
);

function emitCurrent() {
  emit("update:modelValue", formatPhone(areaCode.value, localDigits.value));
}

function onLocalInput(v: unknown) {
  localDigits.value = String(v ?? "").replace(/\D/g, "");
  emitCurrent();
}

/** Flag for a known code; a custom typed one (not in PHONE_AREA_CODES) shows none. */
const currentFlagCountry = computed(
  () => PHONE_AREA_CODES.find((c) => c.code === areaCode.value)?.country,
);

function onAreaCodeInput(v: unknown) {
  const raw = String(v ?? "").trim();
  // A user typing a bare calling code (e.g. "52") instead of "+52" is the
  // common slip worth normalizing — parsePhone/formatPhone both require the
  // leading "+" to treat this as an area code at all.
  areaCode.value = !raw || raw.startsWith("+") ? raw : `+${raw.replace(/\D/g, "")}`;
}

watch(areaCode, emitCurrent);
</script>

<style scoped>
/*
 * The two Vuetify fields are visually fused into one control: the area-code
 * select's right corners are squared off, the number field's left corners
 * and left border are removed and it's pulled 1px left to sit flush against
 * the select's right border — that border becomes the single divider line
 * between the two segments instead of two adjacent field outlines.
 */
.pwa-phone-field {
  display: flex;
}
.pwa-phone-field__code {
  /* No menu-icon (see template) leaves just flag + "+48" to fit, so this can
     stay narrow — capped at ~26% of the row's width. The floor is a hard
     requirement, not a nice-to-have: below ~108px flag + a 3-digit code
     ellipsis-truncates ("+48" → "+…") on a narrow (mobile-width) dialog,
     which must never happen — verified against an actual render. */
  flex: 0 0 clamp(108px, 26%, 132px);
}
/*
 * A VSelect's dropdown-arrow affix (.v-field--appended) triggers a Vuetify
 * grid auto-row-sizing quirk that inflates .v-field to ~70px regardless of
 * width, vs. a plain VTextField's 48px at the same density — reproduced with
 * zero custom classes, so it's a Vuetify rendering issue, not one of ours.
 * Forcing the box back down to the sibling's height is the direct fix.
 * Same VField internals under VCombobox, so it applies there too.
 */
.pwa-phone-field__code :deep(.v-field) {
  --v-field-padding-start: 10px;
  --v-field-padding-after: 4px;
  min-height: 48px;
  max-height: 48px;
}
.pwa-phone-field__code :deep(.v-field__prepend-inner) {
  padding-inline-end: 6px;
  align-items: center;
}
.pwa-phone-field__number {
  flex: 1;
  min-width: 0;
  margin-left: -1px;
}
.pwa-phone-field__code :deep(.v-field__outline__end) {
  border-start-end-radius: 0;
  border-end-end-radius: 0;
}
.pwa-phone-field__number :deep(.v-field__outline__start) {
  border-inline-start-width: 0;
  border-start-start-radius: 0;
  border-end-start-radius: 0;
}
.pwa-phone-field:focus-within .pwa-phone-field__code :deep(.v-field__outline),
.pwa-phone-field:focus-within .pwa-phone-field__number :deep(.v-field__outline) {
  color: rgb(var(--v-theme-primary));
}

/*
 * Menu list items: a custom #prepend slot (vs. Vuetify's own icon/avatar
 * shorthand props) doesn't get the usual .v-list-item__spacer gap, so the
 * flag sat flush against the code text with 0px between them.
 */
.pwa-phone-field__item-flag {
  margin-inline-end: 10px;
}
.pwa-phone-field__item {
  padding-inline-start: 14px;
}
</style>
