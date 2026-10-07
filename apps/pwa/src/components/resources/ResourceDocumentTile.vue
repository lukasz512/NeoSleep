<template>
  <div
    class="video-card"
    :class="{ 'video-card--pressing': pressing, 'video-card--row': layout === 'row', 'video-card--done': isOpened }"
    :data-status="isOpened ? 'completed' : 'not_started'"
    role="button"
    tabindex="0"
    :aria-label="t('user.resources.documents.open', { title })"
    data-testid="resource-document-tile"
    :data-document-id="item.id"
    @click="open"
    @keydown.enter.prevent="open"
    @keydown.space.prevent="open"
    @animationend="pressing = false"
  >
    <div class="video-card__thumb" :data-state="coverState">
      <img
        v-if="coverState !== 'error'"
        class="video-card__image"
        :src="featuredCoverHref(item)"
        alt=""
        loading="lazy"
        decoding="async"
        @load="coverState = 'ready'"
        @error="coverState = 'error'"
      />
      <span class="video-card__status" :class="isOpened ? 'video-card__status--completed' : 'video-card__status--not_started'" data-testid="document-status">
        {{ t(isOpened ? "user.resources.documents.status.opened" : "user.resources.documents.status.not_opened") }}
      </span>
      <span v-if="isNew" class="video-card__new" data-testid="document-new">{{ t("user.resources.documents.new") }}</span>
      <span class="video-card__duration" data-testid="document-slides">{{ t("user.resources.documents.slides", { n: item.slides }) }}</span>
    </div>
    <span class="video-card__body">
      <span class="video-card__title-row">
        <span class="video-card__title">{{ title }}</span>
        <VMenu location="bottom end">
          <template #activator="{ props: menuProps }">
            <button
              v-bind="menuProps"
              type="button"
              class="video-card__menu"
              data-testid="document-menu"
              :title="t('user.resources.documents.menu.label')"
              :aria-label="t('user.resources.documents.menu.label')"
              @click.stop
              @keydown.enter.stop
              @keydown.space.stop
            >
              <AppIcon name="dots-vertical" />
            </button>
          </template>
          <VList density="compact" class="video-card__menu-list">
            <VListItem
              v-if="isOpened"
              data-testid="document-mark-not-opened"
              :title="t('user.resources.documents.menu.markNotOpened')"
              @click="markNotOpened(item.id)"
            />
            <VListItem v-else data-testid="document-mark-opened" :title="t('user.resources.documents.menu.markOpened')" @click="markOpened(item.id)" />
          </VList>
        </VMenu>
      </span>
      <span v-if="openedLine" class="video-card__status-line video-card__status-line--completed" data-testid="document-status-line">{{ openedLine }}</span>
      <span class="video-card__meta">
        <span class="video-card__author">{{ metaLine }}</span>
        <span class="video-card__langs">
          <span class="video-card__lang">
            <PartnerLanguageFlag :code="item.language" />
            {{ item.language.toUpperCase() }}
          </span>
        </span>
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../AppIcon.vue";
import PartnerLanguageFlag from "./PartnerLanguageFlag.vue";
import { featuredResourceHref, featuredCoverHref, isNewEdition, type FeaturedResource } from "../../config/featuredResources";
import { useFeaturedProgress } from "../../composables/useFeaturedProgress";
import "./resourceCards.css";

/**
 * One of the app's own PDFs as a card with the anatomy of a webinar card
 * (ResourceVideoTile): 16:9 cover, state badge top-left, slide count
 * bottom-right, "New" top-right for 30 days after an edition, two-line title,
 * a meta line and the language. A click opens the file in a new tab and
 * records it as opened (opened = completed); the menu marks by hand.
 */
const props = withDefaults(defineProps<{ item: FeaturedResource; layout?: "card" | "row"; now?: Date }>(), {
  layout: "card",
  now: () => new Date(),
});
const { t, locale } = useI18n();

const coverState = ref<"loading" | "ready" | "error">("loading");
const { opened, markOpened, markNotOpened } = useFeaturedProgress();

const title = computed(() => t(props.item.titleKey));
const isOpened = computed(() => props.item.id in opened);
const isNew = computed(() => isNewEdition(props.item.editionDate, props.now));

/** The app's internal locale ids are not all valid BCP 47 tags (mx = es-MX). */
const DATE_LOCALES: Record<string, string> = { en: "en", pl: "pl", mx: "es-MX" };
function formatDate(date: string, withYear: boolean): string {
  return new Date(date).toLocaleDateString(DATE_LOCALES[locale.value] ?? locale.value, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

const openedLine = computed(() => {
  const at = opened[props.item.id]?.completedAt;
  return at ? t("user.resources.documents.openedOn", { date: formatDate(at, false) }) : "";
});
const metaLine = computed(() => {
  if (props.item.editionDate) return t("user.resources.documents.edition", { date: formatDate(props.item.editionDate, true) });
  return props.item.subtitleKey ? t(props.item.subtitleKey) : "";
});

const pressing = ref(false);
function open(): void {
  pressing.value = false;
  requestAnimationFrame(() => (pressing.value = true));
  window.open(featuredResourceHref(props.item), "_blank", "noopener");
  void markOpened(props.item.id);
}
</script>
