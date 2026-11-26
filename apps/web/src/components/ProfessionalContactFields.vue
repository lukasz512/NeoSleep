<template>
  <div class="pcf">
    <div class="pcf__row">
      <div class="pcf__field">
        <label :for="`${idPrefix}-firstName`">{{ t("website.professionalsPage.booking.fieldFirstName") }}</label>
        <input
          :id="`${idPrefix}-firstName`"
          v-model="firstName"
          type="text"
          autocomplete="given-name"
          required
          class="pcf__input"
        />
      </div>
      <div class="pcf__field">
        <label :for="`${idPrefix}-lastName`">{{ t("website.professionalsPage.booking.fieldLastName") }}</label>
        <input
          :id="`${idPrefix}-lastName`"
          v-model="lastName"
          type="text"
          autocomplete="family-name"
          required
          class="pcf__input"
        />
      </div>
    </div>

    <div class="pcf__field">
      <label :for="`${idPrefix}-institution`">{{ t("website.professionalsPage.booking.fieldInstitution") }}</label>
      <input
        :id="`${idPrefix}-institution`"
        v-model="institution"
        type="text"
        autocomplete="organization"
        required
        class="pcf__input"
      />
    </div>

    <div class="pcf__row">
      <div class="pcf__field">
        <label :for="`${idPrefix}-phone`">{{ t("website.professionalsPage.booking.fieldPhone") }}</label>
        <input
          :id="`${idPrefix}-phone`"
          v-model="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          required
          pattern="[0-9+\-()\s]{7,20}"
          :title="t('website.professionalsPage.booking.fieldPhoneHint')"
          class="pcf__input"
        />
      </div>
      <div class="pcf__field">
        <label :for="`${idPrefix}-email`">{{ t("website.professionalsPage.booking.fieldEmail") }}</label>
        <input
          :id="`${idPrefix}-email`"
          v-model="email"
          type="email"
          inputmode="email"
          autocomplete="email"
          required
          class="pcf__input"
        />
      </div>
    </div>

    <div class="pcf__row">
      <div class="pcf__field">
        <label :for="`${idPrefix}-city`">{{ t("website.professionalsPage.booking.fieldCity") }}</label>
        <input
          :id="`${idPrefix}-city`"
          v-model="city"
          type="text"
          autocomplete="address-level2"
          required
          class="pcf__input"
        />
      </div>
      <div class="pcf__field">
        <label :for="`${idPrefix}-country`">{{ t("website.professionalsPage.booking.fieldCountry") }}</label>
        <select :id="`${idPrefix}-country`" v-model="countryCode" required class="pcf__input">
          <option value="PL">{{ t("website.professionalsPage.booking.countryPL") }}</option>
          <option value="MX">{{ t("website.professionalsPage.booking.countryMX") }}</option>
          <option value="OTHER">{{ t("website.professionalsPage.booking.countryOther") }}</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// A regular (non-setup) script block, so these can be real named exports —
// <script setup> can only export types, not runtime bindings like this factory.
export interface ProfessionalContactData {
  firstName: string;
  lastName: string;
  institution: string;
  phone: string;
  email: string;
  city: string;
  countryCode: string;
}

export function emptyProfessionalContactData(): ProfessionalContactData {
  return { firstName: "", lastName: "", institution: "", phone: "", email: "", city: "", countryCode: "PL" };
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  modelValue: ProfessionalContactData;
  /** Unique per instance so two copies of this form (e.g. contact page + booking modal) never collide on input ids/labels. */
  idPrefix: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: ProfessionalContactData];
}>();

const { t } = useI18n();

/** One writable computed per field — v-model on an object prop needs each field to emit its own update:modelValue with the rest of the object spread in. */
function field<K extends keyof ProfessionalContactData>(key: K) {
  return computed<ProfessionalContactData[K]>({
    get: () => props.modelValue[key],
    set: (value) => emit("update:modelValue", { ...props.modelValue, [key]: value }),
  });
}

const firstName = field("firstName");
const lastName = field("lastName");
const institution = field("institution");
const phone = field("phone");
const email = field("email");
const city = field("city");
const countryCode = field("countryCode");
</script>

<style lang="scss" scoped>
.pcf {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.pcf__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.pcf__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-text);
  }
}

.pcf__input {
  width: 100%;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  font-size: 1rem;
  font-family: inherit;
  background: var(--website-bg);
  color: var(--website-text);

  &:focus {
    outline: none;
    border-color: var(--website-primary);
    box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.15);
  }

  &:invalid:not(:placeholder-shown):not(:focus) {
    border-color: #e0a800;
  }
}
</style>
