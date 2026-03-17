<template>
  <div class="view-contact">
    <div class="view-contact__container page-container">

      <!-- Info panel (left column) -->
      <aside class="view-contact__info">
        <h1 class="view-contact__title">{{ t("website.contact.title") }}</h1>
        <Transition name="contact-subtitle" mode="out-in">
          <p :key="formType" class="view-contact__subtitle">{{ subtitleByType }}</p>
        </Transition>
        <div class="view-contact__tabs" role="tablist" :aria-label="t('website.contact.tabsAriaLabel')">
          <div class="view-contact__tab-slider" :class="`view-contact__tab-slider--${formType}`" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            :aria-selected="formType === 'patient'"
            :class="['view-contact__tab', { 'view-contact__tab--active': formType === 'patient' }]"
            @click="setFormType('patient')"
          >
            {{ t("website.contact.tabPatient") }}
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="formType === 'professional'"
            :class="['view-contact__tab', { 'view-contact__tab--active': formType === 'professional' }]"
            @click="setFormType('professional')"
          >
            {{ t("website.contact.tabProfessional") }}
          </button>
        </div>
      </aside>

      <!-- Form panel (right column) -->
      <div class="view-contact__form-wrap">
        <form class="view-contact__form" @submit.prevent="onSubmit">

          <Transition name="contact-fields" mode="out-in">
            <div :key="formType" class="view-contact__fields">

              <!-- Imię + Nazwisko -->
              <div class="view-contact__row">
                <div class="view-contact__field">
                  <label for="contact-firstName">{{ t("website.contact.firstName") }}</label>
                  <input
                    id="contact-firstName"
                    ref="firstNameRef"
                    v-model="form.firstName"
                    type="text"
                    required
                    :placeholder="t('website.contact.firstNamePlaceholder')"
                    class="view-contact__input"
                  />
                </div>
                <div class="view-contact__field">
                  <label for="contact-lastName">{{ t("website.contact.lastName") }}</label>
                  <input
                    id="contact-lastName"
                    v-model="form.lastName"
                    type="text"
                    required
                    :placeholder="t('website.contact.lastNamePlaceholder')"
                    class="view-contact__input"
                  />
                </div>
              </div>

              <!-- Telefon + Email (tylko pacjent) -->
              <div class="view-contact__row">
                <div class="view-contact__field">
                  <label for="contact-phone">{{ t("website.contact.phone") }}</label>
                  <input
                    id="contact-phone"
                    v-model="form.phone"
                    type="tel"
                    required
                    :placeholder="t('website.contact.phonePlaceholder')"
                    class="view-contact__input"
                  />
                </div>
                <div v-if="formType === 'patient'" class="view-contact__field">
                  <label for="contact-email">{{ t("website.contact.email") }}</label>
                  <input
                    id="contact-email"
                    v-model="form.email"
                    type="email"
                    required
                    :placeholder="t('website.contact.emailPlaceholder')"
                    class="view-contact__input"
                  />
                </div>
              </div>

              <!-- Miasto -->
              <div class="view-contact__field">
                <label for="contact-city">{{ t("website.contact.city") }}</label>
                <input
                  id="contact-city"
                  v-model="form.city"
                  type="text"
                  required
                  :placeholder="t('website.contact.cityPlaceholder')"
                  class="view-contact__input"
                />
              </div>

              <!-- Komentarz pacjenta -->
              <div v-if="formType === 'patient'" class="view-contact__field">
                <label for="contact-message">{{ t("website.contact.message") }}</label>
                <textarea
                  id="contact-message"
                  v-model="form.message"
                  rows="4"
                  required
                  :placeholder="t('website.contact.messagePlaceholder')"
                  class="view-contact__input view-contact__textarea"
                />
              </div>

              <!-- Pacjent: rozszerzone dane -->
              <template v-if="formType === 'patient'">
                <button type="button" class="view-contact__expand-toggle" @click="showMore = !showMore">
                  <span class="view-contact__expand-icon" :class="{ 'view-contact__expand-icon--open': showMore }">›</span>
                  {{ showMore ? t("website.contact.showLess") : t("website.contact.showMore") }}
                </button>
                <div v-if="showMore" class="view-contact__field">
                  <label for="contact-notes">{{ t("website.contact.notes") }}</label>
                  <textarea
                    id="contact-notes"
                    v-model="form.notes"
                    rows="3"
                    :placeholder="t('website.contact.notesPlaceholder')"
                    class="view-contact__input view-contact__textarea"
                  />
                </div>
              </template>

            </div>
          </Transition>

          <!-- Submit (poza animacją) -->
          <button type="submit" class="view-contact__submit" :disabled="status === 'loading'">
            {{ status === "loading" ? t("website.contact.sending") : t("website.contact.submit") }}
          </button>
          <p v-if="status === 'success'" class="view-contact__feedback view-contact__feedback--success">
            {{ t("website.contact.success") }}
          </p>
          <p v-if="status === 'error'" class="view-contact__feedback view-contact__feedback--error">
            {{ t("website.contact.error") }}
          </p>

        </form>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, onMounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

type FormType = "patient" | "professional";
type Status = "idle" | "loading" | "success" | "error";

const formType = ref<FormType>("patient");
const showMore = ref(false);
const status = ref<Status>("idle");
const firstNameRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  nextTick(() => firstNameRef.value?.focus());
});

function setFormType(type: FormType) {
  formType.value = type;
  showMore.value = false;
  status.value = "idle";
  router.replace({ path: "/contact", query: { ...route.query, type } });
}

watch(
  () => route.query.type,
  (q) => {
    const parsed = q === "patient" || q === "professional" ? (q as FormType) : null;
    if (parsed) formType.value = parsed;
  },
  { immediate: true }
);

const subtitleByType = computed(() =>
  formType.value === "professional"
    ? t("website.contact.subtitleProfessional")
    : t("website.contact.subtitlePatient")
);

const form = reactive({
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  city: "",
  message: "",
  notes: "",
  companyName: "",
  taxNumber: "",
});

function resetForm() {
  form.firstName = "";
  form.lastName = "";
  form.phone = "";
  form.email = "";
  form.city = "";
  form.message = "";
  form.notes = "";
  form.companyName = "";
  form.taxNumber = "";
  showMore.value = false;
}

async function onSubmit() {
  status.value = "loading";
  try {
    const payload =
      formType.value === "patient"
        ? {
            type: "patient",
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            email: form.email,
            city: form.city,
            message: form.message,
            notes: form.notes,
          }
        : {
            type: "professional",
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            city: form.city,
            companyName: form.companyName,
            taxNumber: form.taxNumber,
          };

    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_key: "669fb922-3b25-4b2c-8d6d-a6bd86b9d5a4", ...payload }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    status.value = "success";
    resetForm();
  } catch {
    status.value = "error";
  }
}
</script>

<style lang="scss" scoped>
.view-contact {
  min-height: 60vh;
  padding: 3rem 0;
  animation: contact-page-in 0.55s ease-out both;

  @media (max-width: 600px) {
    padding: 1.5rem 0 2rem;
  }
}

@keyframes contact-page-in {
  from { opacity: 0; transform: translateY(1.75rem); }
  to   { opacity: 1; transform: translateY(0); }
}

.view-contact__container {
  display: grid;
  grid-template-columns: 1fr 1.75fr;
  gap: 4rem;
  align-items: start;
}

.view-contact__info {
  position: sticky;
  top: calc(var(--website-header-height) + 2rem);
}

.view-contact__form-wrap {
  min-width: 0;
}

@media (max-width: 900px) {
  .view-contact__container {
    grid-template-columns: 1fr;
    gap: 2rem;
    width: 100%;
  }

  .view-contact__info {
    position: static;
  }
}

.view-contact__title {
  font-size: clamp(1.5rem, 6vw, 2rem);
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--website-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.view-contact__subtitle {
  font-size: 1.0625rem;
  color: var(--website-text-secondary);
  margin: 0 0 1.25rem;
  line-height: 1.6;
  white-space: pre-line;
}

.view-contact__tabs {
  position: relative;
  display: flex;
  padding: 4px;
  background: var(--website-border);
  border-radius: 12px;
  width: fit-content;
  gap: 0;
}

.view-contact__tab-slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  background: var(--website-bg);
  border-radius: 8px;
  box-shadow: var(--website-shadow-sm);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;

  &--professional {
    transform: translateX(100%);
  }
}

.view-contact__tab {
  position: relative;
  z-index: 1;
  padding: 0.5rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  font-family: inherit;
  color: var(--website-text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.2s ease;
  white-space: nowrap;

  &:hover {
    color: var(--website-text);
  }

  &--active {
    color: var(--website-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

.view-contact__fields {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Subtitle transition */
.contact-subtitle-enter-active,
.contact-subtitle-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.contact-subtitle-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.contact-subtitle-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Fields transition */
.contact-fields-enter-active,
.contact-fields-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.contact-fields-enter-from {
  opacity: 0;
  transform: translateX(10px);
}
.contact-fields-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.view-contact__form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 2rem;
  background: var(--website-bg);
  border: 1px solid var(--website-border);
  border-radius: calc(var(--website-radius) * 2);
  box-shadow: var(--website-shadow-sm);
}

.view-contact__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.view-contact__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-text);
  }
}

.view-contact__input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--website-border);
  border-radius: var(--website-radius);
  font-size: 1rem;
  font-family: inherit;
  background: var(--website-bg);
  color: var(--website-text);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &::placeholder {
    color: var(--website-text-secondary);
    opacity: 0.85;
  }

  &:focus {
    outline: none;
    border-color: var(--website-primary);
    box-shadow: 0 0 0 3px rgba(18, 143, 131, 0.15);
  }
}

.view-contact__textarea {
  resize: vertical;
  min-height: 120px;
}

.view-contact__expand-toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.875rem;
  font-weight: 500;
  font-family: inherit;
  color: var(--website-primary);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  width: fit-content;
  transition: opacity 0.15s ease;

  &:hover {
    opacity: 0.75;
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
    border-radius: 2px;
  }
}

.view-contact__expand-icon {
  display: inline-block;
  font-size: 1.1rem;
  line-height: 1;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform: rotate(0deg);
  will-change: transform;

  &--open {
    transform: rotate(90deg);
  }
}

.view-contact__feedback {
  font-size: 0.9375rem;
  margin: 0;
  padding: 0.75rem 1rem;
  border-radius: var(--website-radius);

  &--success {
    background: color-mix(in srgb, var(--website-primary) 10%, transparent);
    color: var(--website-primary);
  }

  &--error {
    background: color-mix(in srgb, #e53e3e 10%, transparent);
    color: #c53030;
  }
}

.view-contact__submit {
  min-height: var(--website-btn-min-height);
  min-width: var(--website-btn-min-width);
  padding: 0 1.75rem;
  margin-top: 0.25rem;
  background: var(--website-primary);
  color: #fff;
  font-weight: 600;
  font-size: 1rem;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  align-self: flex-start;

  @media (max-width: 600px) {
    align-self: center;
    width: 100%;
  }
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--website-primary-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

@media (max-width: 600px) {
  .view-contact__form {
    padding: 1.25rem 1rem;
  }

  .view-contact__tabs {
    width: 100%;
  }

  .view-contact__tab {
    flex: 1;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .view-contact__row {
    grid-template-columns: 1fr;
  }

  .view-contact__subtitle {
    font-size: 0.9375rem;
  }
}
</style>
