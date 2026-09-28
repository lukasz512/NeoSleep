<!-- Section 09. Closes on the strongest stage AJM has on film (eFashion Day Live 2020 studio):
     the loop plays full-bleed and slowly pushes in as the section scrolls up, the question rises
     through a mask, one oversized CTA, then the four channels with icons. -->
<template>
  <section id="contacto" ref="root" class="contact" :class="{ 'is-in': seen }">
    <div class="contact__bg" :style="{ '--push': push }">
      <LoopVideo
        class="contact__video"
        :src="loopUrl('contact/stage', lite)"
        :poster="picture(lite ? 'contact/stage-poster-640' : 'contact/stage-poster')"
        :label="t('contact.stageLabel')"
        :play-label="t('media.play')"
        :lite="lite"
      />
    </div>
    <div class="contact__scrim" />
    <div class="contact__copy">
      <p v-reveal class="eyebrow contact__person">{{ t("contact.person") }}</p>
      <h2 class="contact__title">
        <span class="mask-line"><span>{{ t("contact.title") }}</span></span>
      </h2>
      <p v-reveal="{ delay: 120 }" class="contact__body">{{ t("contact.body") }}</p>
      <a
        v-reveal="{ delay: 220 }"
        class="contact__cta"
        :href="whatsappLink(t('contact.whatsappMessage'))"
        target="_blank"
        rel="noopener"
      >
        <span>{{ t("contact.cta") }}</span> <span class="contact__arrow" aria-hidden="true">→</span>
      </a>
      <ul class="contact__list">
        <li v-for="(c, i) in channels" :key="c.icon" v-reveal="{ delay: 300 + i * 70 }">
          <a :href="c.href" :target="c.external ? '_blank' : undefined" :rel="c.external ? 'noopener' : undefined">
            <SocialIcon :name="c.icon" class="contact__icon" />
            <span class="contact__label">{{ c.label }}</span>
            <span class="contact__value">{{ c.value }}</span>
          </a>
        </li>
      </ul>
      <p class="contact__places">AJ Management · {{ t("contact.places") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import LoopVideo from "./LoopVideo.vue";
import SocialIcon from "./SocialIcon.vue";
import { CONTACT, whatsappLink } from "../content/contact";
import { loopUrl, picture } from "../lib/media";
import { useInView } from "../lib/useInView";
import { useScrollProgress, vReveal } from "../lib/motion";

const props = defineProps<{ lite: boolean }>();
const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const seen = useInView(root, "-10%");

// The stage pushes in (1.12 → 1) while the section scrolls into place.
const progress = useScrollProgress(root, "enter");
const push = computed(() => (props.lite ? "1" : (1.12 - progress.value * 0.12).toFixed(4)));

const channels = computed(() => [
  { icon: "email" as const, label: t("contact.email"), value: CONTACT.email, href: `mailto:${CONTACT.email}`, external: false },
  {
    icon: "whatsapp" as const,
    label: t("contact.whatsapp"),
    value: CONTACT.whatsappDisplay,
    href: whatsappLink(t("contact.whatsappMessage")),
    external: true,
  },
  { icon: "linkedin" as const, label: t("contact.linkedin"), value: "Alfred Jan Díaz", href: CONTACT.linkedin, external: true },
  {
    icon: "instagram" as const,
    label: t("contact.instagram"),
    value: `@${CONTACT.instagram}`,
    href: `https://instagram.com/${CONTACT.instagram}`,
    external: true,
  },
]);
</script>

<style scoped>
.contact {
  position: relative;
  min-height: 110svh;
  display: grid;
  align-items: center;
  color: var(--ajm-paper);
  overflow: hidden;
  background: var(--ajm-ink);
}
.contact__bg {
  position: absolute;
  inset: 0;
  transform: scale(var(--push, 1));
  transform-origin: 50% 40%;
}
.contact__video,
.contact__video :deep(img),
.contact__video :deep(video) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.contact__scrim {
  position: absolute;
  inset: 0;
  background: rgba(14, 12, 20, 0.44);
}
.contact__copy {
  position: relative;
  padding: 120px var(--ajm-gutter);
  max-width: 1040px;
}
.contact__person {
  color: rgba(244, 241, 234, 0.7);
  margin: 0 0 20px;
}
.contact__title {
  margin: 0 0 24px;
  font: 500 clamp(44px, 8vw, 128px) / 0.96 var(--ajm-font);
  letter-spacing: -0.03em;
}
.contact__title .mask-line > span {
  transition-duration: 1.2s;
}
.contact__body {
  max-width: 560px;
  margin: 0 0 40px;
  font-size: clamp(17px, 1.5vw, 20px);
  color: rgba(244, 241, 234, 0.86);
}
.contact__cta {
  display: inline-flex;
  align-items: baseline;
  gap: 16px;
  font: 500 clamp(22px, 2.6vw, 34px) var(--ajm-font);
  letter-spacing: -0.01em;
  text-decoration: none;
  padding-bottom: 8px;
  margin-bottom: 56px;
  background: none;
  position: relative;
}
.contact__cta::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: currentColor;
  transform-origin: left;
  transition: transform 0.6s var(--ajm-ease);
}
.contact__cta:hover::after {
  transform: scaleX(0.35);
}
.contact__arrow {
  display: inline-block;
  transition: transform 0.5s var(--ajm-ease);
}
.contact__cta:hover .contact__arrow {
  transform: translateX(10px);
}
.contact__list {
  list-style: none;
  margin: 0 0 32px;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 40px;
  max-width: 820px;
  border-top: 1px solid rgba(244, 241, 234, 0.2);
}
.contact__list a {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 2px 14px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(244, 241, 234, 0.2);
  text-decoration: none;
  transition: padding-left 0.4s var(--ajm-ease);
}
.contact__list a:hover {
  padding-left: 8px;
}
.contact__icon {
  grid-row: span 2;
  font-size: 26px;
  opacity: 0.9;
}
.contact__label {
  font: 500 11px var(--ajm-font);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(244, 241, 234, 0.6);
}
.contact__value {
  font-size: 17px;
  overflow-wrap: anywhere;
}
.contact__places {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(244, 241, 234, 0.65);
}
@media (max-width: 640px) {
  .contact__list {
    grid-template-columns: 1fr;
  }
}
</style>
