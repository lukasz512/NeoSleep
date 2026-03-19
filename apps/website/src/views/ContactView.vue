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

<style lang="scss" scoped src="./ContactView.scss" />
