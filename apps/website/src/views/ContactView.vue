<template>
  <div class="view-contact">
    <div class="view-contact__inner">
      <h1 class="view-contact__title">{{ t("website.contact.title") }}</h1>
      <p class="view-contact__subtitle">{{ t("website.contact.subtitle") }}</p>
      <form class="view-contact__form" @submit.prevent="onSubmit">
        <div class="view-contact__field">
          <label for="contact-name">{{ t("website.contact.name") }}</label>
          <input id="contact-name" v-model="form.name" type="text" required :placeholder="t('website.contact.namePlaceholder')" />
        </div>
        <div class="view-contact__field">
          <label for="contact-email">{{ t("website.contact.email") }}</label>
          <input id="contact-email" v-model="form.email" type="email" required :placeholder="t('website.contact.emailPlaceholder')" />
        </div>
        <div class="view-contact__field">
          <label for="contact-subject">{{ t("website.contact.subject") }}</label>
          <input id="contact-subject" v-model="form.subject" type="text" :placeholder="t('website.contact.subjectPlaceholder')" />
        </div>
        <div class="view-contact__field">
          <label for="contact-message">{{ t("website.contact.message") }}</label>
          <textarea id="contact-message" v-model="form.message" rows="5" required :placeholder="t('website.contact.messagePlaceholder')" />
        </div>
        <button type="submit" class="view-contact__submit">
          {{ t("website.contact.submit") }}
        </button>
      </form>
    </div>
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
  padding: 3rem 1.5rem;
}

.view-contact__inner {
  max-width: 560px;
  margin: 0 auto;
}

.view-contact__title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: var(--website-text);
}

.view-contact__subtitle {
  font-size: 1rem;
  color: var(--website-text-secondary);
  margin: 0 0 2rem;
  line-height: 1.5;
}

.view-contact__form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.view-contact__field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--website-text);
  }

  input,
  textarea {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--website-border);
    border-radius: var(--website-radius);
    font-size: 1rem;
    font-family: inherit;

    &::placeholder {
      color: var(--website-text-secondary);
      opacity: 0.8;
    }
  }

  textarea {
    resize: vertical;
    min-height: 120px;
  }
}

.view-contact__submit {
  min-height: var(--website-btn-min-height);
  padding: 0 1.5rem;
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
}
</style>
