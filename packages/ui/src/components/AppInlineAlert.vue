<template>
  <div
    class="app-inline-alert"
    :class="`app-inline-alert--${type}`"
    :role="type === 'error' || type === 'warning' ? 'alert' : 'status'"
  >
    <span class="app-inline-alert__dot" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path :d="ICONS[type]" /></svg>
    </span>
    <div class="app-inline-alert__text">
      <strong v-if="title" class="app-inline-alert__title">{{ title }}</strong>
      <div v-if="text || $slots.default" class="app-inline-alert__body"><slot>{{ text }}</slot></div>
      <button v-if="actionLabel" type="button" class="app-inline-alert__action" @click="emit('action')">
        {{ actionLabel }}
      </button>
    </div>
    <div v-if="$slots.append" class="app-inline-alert__append"><slot name="append" /></div>
    <button
      v-if="closeLabel"
      type="button"
      class="app-inline-alert__close"
      :aria-label="closeLabel"
      @click="emit('close')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * The one inline alert of the app (NEO-105, Łukasz's pick "B · soft card"):
 * a message that belongs to the form or screen it sits in — a validation
 * gap, a failed save, an offline notice. Tinted card, hairline border in the
 * tone, the icon in a filled circle centred on the text, bold title, body,
 * optional action link. Toasts (useNotifications) stay for events that
 * aren't tied to a place on screen.
 *
 * Colours come from the Vuetify theme (warning/error/info/success), so a
 * tenant palette or dark mode flows through. The ink is the tone mixed with
 * on-surface: the old VAlert set orange text on peach (~2.3:1), below WCAG.
 */
const {
  type = "info",
  title,
  text,
  actionLabel,
  closeLabel,
} = defineProps<{
  type?: "info" | "warning" | "error" | "success";
  title?: string;
  /** Body text; the default slot wins when both are given. */
  text?: string;
  /** Shows a link-style button under the body; emits `action`. */
  actionLabel?: string;
  /** Set it (the translated "Close") to show a dismiss button; emits `close`. No i18n here, so the component mounts anywhere. */
  closeLabel?: string;
}>();

const emit = defineEmits<{ action: []; close: [] }>();

/** Glyphs drawn in white inside the tone-coloured circle. */
const ICONS: Record<"info" | "warning" | "error" | "success", string> = {
  warning: "M12 6.5v7M12 17.4v.1",
  error: "m8 8 8 8M16 8l-8 8",
  info: "M12 6.9v.1M12 10.5v7",
  success: "m6.5 12.5 3.8 3.8 7.2-8",
};
</script>

<style scoped>
.app-inline-alert {
  --alert-tone: var(--v-theme-info);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(var(--alert-tone), 0.3);
  background: rgba(var(--alert-tone), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.87);
  font-size: 0.875rem;
  line-height: 1.45;
  text-align: start;
}
.app-inline-alert--warning { --alert-tone: var(--v-theme-warning); }
.app-inline-alert--error { --alert-tone: var(--v-theme-error); }
.app-inline-alert--success { --alert-tone: var(--v-theme-success); }

.app-inline-alert__dot {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgb(var(--alert-tone));
}
.app-inline-alert__dot svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-inline-alert__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  overflow-wrap: anywhere;
}

/* Tone mixed toward the text colour: keeps the hue, reaches body-text contrast in light and dark. */
.app-inline-alert__title,
.app-inline-alert__action {
  color: color-mix(in srgb, rgb(var(--alert-tone)) 58%, rgb(var(--v-theme-on-surface)));
  font-weight: 600;
}

.app-inline-alert__action {
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 0.84375rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.app-inline-alert__append {
  flex: none;
}

.app-inline-alert__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: -6px -6px -6px 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
}
.app-inline-alert__close:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}
.app-inline-alert__close svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
}

.app-inline-alert__action:focus-visible,
.app-inline-alert__close:focus-visible {
  outline: 2px solid rgb(var(--alert-tone));
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
