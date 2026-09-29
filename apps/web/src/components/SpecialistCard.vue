<template>
  <article
    class="fs-card"
    :class="{ 'fs-card--active': active }"
    :data-specialist-id="specialist.id"
    @click="onCardClick"
  >
    <div v-if="labels.length" class="fs-card__tags">
      <span v-for="label in labels" :key="label" class="fs-card__tag">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M7.5 2C4.9 2 3 4.1 3 6.9c0 2 .7 3.4 1.2 5 .6 2 .8 4.2 1.4 6.3.4 1.6 1 3.3 2.2 3.3 1.5 0 1.6-2.5 2-4.3.3-1.4.8-2.7 2.2-2.7s1.9 1.3 2.2 2.7c.4 1.8.5 4.3 2 4.3 1.2 0 1.8-1.7 2.2-3.3.6-2.1.8-4.3 1.4-6.3.5-1.6 1.2-3 1.2-5C21 4.1 19.1 2 16.5 2c-1.9 0-2.8 1-4.5 1S9.4 2 7.5 2Z"/></svg>
        {{ label }}
      </span>
    </div>

    <h3 class="fs-card__title">
      <button
        type="button"
        class="fs-card__select"
        :aria-pressed="active"
        :aria-label="t('website.findSpecialist.showOnMap', { name: specialist.name })"
        @click.stop="emit('select', specialist.id)"
      >
        {{ specialist.name }}
      </button>
    </h3>

    <p v-if="address" class="fs-card__address">{{ address }}</p>

    <p v-if="specialist.practitioners.length > 0" class="fs-card__doctors">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></g></svg>
      <span>{{ t("website.findSpecialist.doctorsLabel") }} {{ specialist.practitioners.map((p) => p.name).join(", ") }}</span>
    </p>

    <div class="fs-card__actions">
      <a
        v-if="tel"
        :href="tel"
        class="fs-card__action fs-card__action--primary"
        :aria-label="t('website.findSpecialist.callAria', { name: specialist.name, phone: specialist.phone ?? '' })"
        @click.stop
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>
        <span>{{ t("website.findSpecialist.call") }}</span>
        <span class="fs-card__phone">{{ specialist.phone }}</span>
      </a>
      <a
        :href="directions"
        target="_blank"
        rel="noopener"
        class="fs-card__action"
        :aria-label="`${t('website.findSpecialist.directions')} — ${specialist.name} ${t('website.findSpecialist.opensInNewTab')}`"
        @click.stop
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
        <span>{{ t("website.findSpecialist.directions") }}</span>
      </a>
      <a
        v-if="site"
        :href="site"
        target="_blank"
        rel="noopener"
        class="fs-card__action"
        :aria-label="`${t('website.findSpecialist.website')} — ${specialist.name} ${t('website.findSpecialist.opensInNewTab')}`"
        @click.stop
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></g></svg>
        <span>{{ t("website.findSpecialist.website") }}</span>
      </a>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import {
  addressLine,
  directionsHref,
  specialtiesOf,
  specialtyLabelKey,
  telHref,
  websiteHref,
  type Specialist,
} from "../utils/specialists";

/**
 * One clinic in the find-a-specialist list (NEO-79, option A). Primary
 * action is the call (tel:, number shown as text too); directions and
 * website are secondary, and an action whose data is missing is hidden.
 * Clicking the card (or its name button, for keyboard users) selects it —
 * the page then highlights and pans to its pin.
 */
const props = defineProps<{ specialist: Specialist; active: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();

const { t } = useI18n();

const labels = computed(() => specialtiesOf(props.specialist).map((code) => t(specialtyLabelKey(code))));
const address = computed(() => addressLine(props.specialist));
const tel = computed(() => telHref(props.specialist.phone));
const directions = computed(() => directionsHref(props.specialist));
const site = computed(() => websiteHref(props.specialist.website));

function onCardClick() {
  emit("select", props.specialist.id);
}
</script>
