<template>
  <div id="contact" class="view-contact">
    <section class="view-contact__section view-contact__header">
      <div class="view-contact__inner">
        <h1 class="view-contact__title">{{ t("website.contact.title") }}</h1>
        <p class="view-contact__subtitle">{{ t("website.contact.subtitle") }}</p>
      </div>
    </section>
    <section class="view-contact__section view-contact__form-section">
      <div class="view-contact__inner">
        <form class="view-contact__form" @submit.prevent="onSubmit">
          <div class="view-contact__field">
            <label for="contact-name">{{ t("website.contact.name") }}</label>
            <input
              id="contact-name"
              v-model="form.name"
              type="text"
              required
              :placeholder="t('website.contact.namePlaceholder')"
              class="view-contact__input"
            />
          </div>
          <div class="view-contact__field">
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
          <div class="view-contact__field">
            <label for="contact-subject">{{ t("website.contact.subject") }}</label>
            <input
              id="contact-subject"
              v-model="form.subject"
              type="text"
              :placeholder="t('website.contact.subjectPlaceholder')"
              class="view-contact__input"
            />
          </div>
          <div class="view-contact__field">
            <label for="contact-message">{{ t("website.contact.message") }}</label>
            <textarea
              id="contact-message"
              v-model="form.message"
              rows="5"
              required
              :placeholder="t('website.contact.messagePlaceholder')"
              class="view-contact__input view-contact__textarea"
            />
          </div>
          <button type="submit" class="view-contact__submit">
            {{ t("website.contact.submit") }}
          </button>
        </form>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const form = reactive({
  name: "",
  email: "",
  subject: "",
  message: "",
});

function onSubmit() {
  // TODO: POST to BFF or form provider
  console.log("Contact form:", form);
}
</script>

<style lang="scss" scoped>
.view-contact {
  min-height: 60vh;
}

.view-contact__section {
  padding: 2rem 1.5rem;
}

.view-contact__header {
  padding-top: 1rem;
  padding-bottom: 1rem;
}

.view-contact__form-section {
  padding-top: 0;
}

.view-contact__inner {
  max-width: 560px;
  margin: 0 auto;
}

.view-contact__title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--website-text);
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.view-contact__subtitle {
  font-size: 1.0625rem;
  color: var(--website-text-secondary);
  margin: 0;
  line-height: 1.6;
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
  min-height: 140px;
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
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--website-primary-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--website-primary);
    outline-offset: 2px;
  }
}

@media (max-width: 600px) {
  .view-contact__form {
    padding: 1.5rem;
  }
}
</style>
