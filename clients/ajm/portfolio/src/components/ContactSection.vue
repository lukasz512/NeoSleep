<template>
  <section id="contacto" ref="root" class="contact" :class="{ 'is-in': seen }">
    <picture class="contact__bg">
      <source :srcset="picture('planeta/planeta22-1280').avif" type="image/avif" />
      <img :src="picture('planeta/planeta22-1280').jpg" alt="" loading="lazy" decoding="async" />
    </picture>
    <div class="contact__scrim" />
    <div class="contact__copy">
      <h2 class="contact__title">
        <span class="mask-line"><span>{{ t("contact.title") }}</span></span>
      </h2>
      <p class="contact__body">{{ t("contact.body") }}</p>
      <a class="contact__cta" :href="whatsappLink(t('contact.whatsappMessage'))" target="_blank" rel="noopener">
        {{ t("contact.cta") }} <span aria-hidden="true">→</span>
      </a>
      <ul class="contact__list">
        <li>
          <span class="eyebrow">{{ t("contact.email") }}</span><a :href="`mailto:${CONTACT.email}`">{{ CONTACT.email }}</a>
        </li>
        <li>
          <span class="eyebrow">{{ t("contact.whatsapp") }}</span>
          <a :href="whatsappLink(t('contact.whatsappMessage'))" target="_blank" rel="noopener">{{ CONTACT.whatsappDisplay }}</a>
        </li>
        <li>
          <span class="eyebrow">{{ t("contact.instagram") }}</span>
          <a :href="`https://instagram.com/${CONTACT.instagram}`" target="_blank" rel="noopener">@{{ CONTACT.instagram }}</a>
        </li>
      </ul>
      <p class="contact__places">AJ Management · {{ t("contact.places") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { CONTACT, whatsappLink } from "../content/contact";
import { picture } from "../lib/media";
import { useInView } from "../lib/useInView";

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");
</script>

<style scoped>
.contact {
  position: relative;
  min-height: 100svh;
  display: grid;
  align-items: center;
  color: var(--ajm-paper);
  overflow: hidden;
}
.contact__bg,
.contact__bg img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.contact__scrim {
  position: absolute;
  inset: 0;
  background: rgba(20, 19, 17, 0.62);
}
.contact__copy {
  position: relative;
  padding: 96px var(--ajm-gutter);
  max-width: 1000px;
}
.contact__title {
  margin: 0 0 20px;
  font: 500 clamp(40px, 7vw, 104px) / 0.98 var(--ajm-font);
  letter-spacing: -0.025em;
}
.contact__body {
  max-width: 560px;
  margin: 0 0 36px;
  font-size: clamp(17px, 1.5vw, 20px);
  color: rgba(244, 241, 234, 0.86);
}
.contact__cta {
  display: inline-flex;
  gap: 12px;
  font: 500 clamp(18px, 2vw, 26px) var(--ajm-font);
  text-decoration: none;
  border-bottom: 2px solid currentColor;
  padding-bottom: 6px;
  margin-bottom: 48px;
}
.contact__list {
  list-style: none;
  margin: 0 0 28px;
  padding: 0;
  display: grid;
  gap: 12px;
}
.contact__list li {
  display: flex;
  gap: 16px;
  align-items: baseline;
  flex-wrap: wrap;
}
.contact__list .eyebrow {
  color: rgba(244, 241, 234, 0.6);
  min-width: 96px;
}
.contact__list a {
  text-decoration: none;
  font-size: 18px;
}
.contact__places {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(244, 241, 234, 0.65);
}
</style>
