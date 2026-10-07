<template>
  <section class="view-resources__topic" data-testid="resources-documents">
    <h2 class="view-resources__topic-title">
      {{ t("user.resources.documents.title") }}
      <span class="view-resources__topic-count" data-testid="resources-documents-count">
        {{ t("user.resources.documents.opened", { opened, total }) }}
      </span>
    </h2>
    <div class="view-resources__video-grid" :class="layout === 'list' ? 'view-resources__video-grid--list' : 'view-resources__video-grid--scroll'">
      <ResourceDocumentTile v-for="item in items" :key="item.id" :item="item" :layout="layout === 'list' ? 'row' : 'card'" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ResourceDocumentTile from "./ResourceDocumentTile.vue";
import type { FeaturedResource } from "../../config/featuredResources";
import "./resourceCards.css";

/**
 * The first group on Resources (under the progress meter): the app's own PDFs
 * as cards, with the same heading as the webinar topics. `items` is what the
 * status chip lets through; `opened` and `total` always count the whole group.
 * On phones the cards scroll sideways.
 */
defineProps<{ items: readonly FeaturedResource[]; opened: number; total: number; layout: "cards" | "list" }>();
const { t } = useI18n();
</script>
