<template>
  <div class="view-detail">
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="hcoFormFields"
      :initial-data="hco ?? undefined"
      title-key="user.hco.form.title"
      edit-title-key="user.hco.form.editTitle"
      submit-label-key="user.hco.form.submit"
      edit-submit-label-key="user.hco.form.editSubmit"
      avatar-entity-type="hco"
      @submit="onAccountSubmit"
    />
    <VAlert
      v-if="isOffline"
      type="warning"
      variant="tonal"
      density="compact"
      class="view-detail__offline-banner"
      :text="t('app.common.offlineShowingCached')"
    />
    <ItemDetailLayout
    :has-content="!!hco"
    :loading="loading"
    :load-error="loadFailed"
    :back-route="{ name: 'hco' }"
    :back-label="t('user.hco.detail.back')"
    :not-found-label="t('user.hco.detail.notFound')"
    @retry="loadHCO"
  >
    <template #title v-if="hco">
      <span class="view-item__title-wrap hco-title-row">
        <span class="view-item__title-wrap">
          <AppAvatar entity-type="hco" :org-type="hco.type" :size="40" />
          <h1 class="view-item__title">{{ hco.name }}</h1>
        </span>
        <span class="hco-title-row__badges">
          <VChip :color="hcoTypeColor(hco.type)" size="large" variant="tonal">
            {{ hcoTypeLabel(hco.type) }}
          </VChip>
          <VChip :color="hcoStatusColor(hco.status)" size="large" variant="tonal">
            {{ hcoStatusLabel(hco.status) }}
          </VChip>
        </span>
      </span>
    </template>
    <template #header-actions v-if="hco">
      <VTooltip location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            :class="entityActionBtnClass('scheduleVisit')"
            :aria-label="t('user.detail.scheduleVisit')"
            @click="onScheduleVisit"
          >
            <AppIcon :name="entityActionIcon('scheduleVisit')" class="view-item__action-icon" />
          </AppButton>
        </template>
        <span>{{ t('user.detail.scheduleVisit') }}</span>
      </VTooltip>
      <VTooltip v-if="canEditOrganizations" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            :class="entityActionBtnClass('edit')"
            :aria-label="t('user.hco.detail.edit')"
            @click="onEdit"
          >
            <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
          </AppButton>
        </template>
        <span>{{ t('user.hco.detail.edit') }}</span>
      </VTooltip>
      <VTooltip v-if="isAdmin" location="bottom">
        <template #activator="{ props: tooltipProps }">
          <AppButton
            v-bind="tooltipProps"
            icon
            variant="flat"
            size="large"
            :class="entityActionBtnClass('delete')"
            :aria-label="t('user.hco.detail.delete')"
            @click="showDeleteConfirm = true"
          >
            <AppIcon :name="entityActionIcon('delete')" class="view-item__action-icon" />
          </AppButton>
        </template>
        <span>{{ t('user.hco.detail.delete') }}</span>
      </VTooltip>
    </template>
    <template #sections v-if="hco">
      <DetailViewTabs v-model="activeTab" :tabs="hcoTabs">
        <template #details>
          <div class="hco-details-layout">
            <div class="hco-details-layout__main">
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.region") }}</dt>
                <dd class="view-item__value">{{ territoryLabel }}</dd>
              </div>
              <div v-if="hco.specialties?.length" class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.specialties") }}</dt>
                <dd class="view-item__value hco-specialties">
                  <VChip v-for="code in hco.specialties" :key="code" size="small" variant="outlined">
                    {{ specialtyLabel(code) }}
                  </VChip>
                </dd>
              </div>

              <div class="hco-contact-cards">
                <VTooltip v-if="hco.phone" location="bottom">
                  <template #activator="{ props: tooltipProps }">
                    <a v-bind="tooltipProps" :href="`tel:${hco.phone}`" class="hco-contact-cards__item" :aria-label="t('user.hco.detail.phone')">
                      <AppIcon name="phone" />
                    </a>
                  </template>
                  <span>{{ hco.phone }}</span>
                </VTooltip>
                <VTooltip v-if="hco.email" location="bottom">
                  <template #activator="{ props: tooltipProps }">
                    <a v-bind="tooltipProps" :href="`mailto:${hco.email}`" class="hco-contact-cards__item" :aria-label="t('user.hco.detail.email')">
                      <AppIcon name="mail" />
                    </a>
                  </template>
                  <span>{{ hco.email }}</span>
                </VTooltip>
                <VTooltip v-if="hco.website" location="bottom">
                  <template #activator="{ props: tooltipProps }">
                    <a v-bind="tooltipProps" :href="hco.website" target="_blank" rel="noopener noreferrer" class="hco-contact-cards__item" :aria-label="t('user.hco.detail.website')">
                      <AppIcon name="globe" />
                    </a>
                  </template>
                  <span>{{ hco.website }}</span>
                </VTooltip>
                <VTooltip v-if="hco.google_link" location="bottom">
                  <template #activator="{ props: tooltipProps }">
                    <a v-bind="tooltipProps" :href="hco.google_link" target="_blank" rel="noopener noreferrer" class="hco-contact-cards__item" :aria-label="t('user.hco.detail.googleLink')">
                      <AppIcon name="map-pin" />
                    </a>
                  </template>
                  <span>{{ hco.google_link }}</span>
                </VTooltip>
              </div>
            </div>

            <div class="hco-details-layout__aside">
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.addressLine1") }}</dt>
                <dd class="view-item__value">{{ hco.address_line1 || "—" }}</dd>
              </div>
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.city") }}</dt>
                <dd class="view-item__value">{{ hco.city || "—" }}</dd>
              </div>
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.state") }}</dt>
                <dd class="view-item__value">{{ hco.state || "—" }}</dd>
              </div>
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.postalCode") }}</dt>
                <dd class="view-item__value">{{ hco.postal_code || "—" }}</dd>
              </div>
              <div class="view-item__row">
                <dt class="view-item__label">{{ t("user.hco.detail.countryCode") }}</dt>
                <dd class="view-item__value">{{ hco.country_code || "—" }}</dd>
              </div>
              <HCOLocationMap v-if="hco.latitude && hco.longitude" :latitude="hco.latitude" :longitude="hco.longitude" :name="hco.name" />
            </div>
          </div>
        </template>
        <template #notes>
          <PatientNotesPanel entity-type="organization" :entity-id="hco.id" />
        </template>
        <template #relatedDoctors>
          <RelatedEntityPanel
            :endpoint="`/api/v1/practitioner?organization_id=${hco.id}&limit=-1`"
            detail-route-name="hcp-detail"
            :empty-label="t('user.hco.detail.relatedDoctorsEmpty')"
          />
        </template>
        <template #documents>
          <EntityDocumentsPanel :endpoint="`/api/v1/organization/${hco.id}/documents`" />
        </template>
        <template #history>
          <EntityHistoryPanel :endpoint="`/api/v1/organization/${hco.id}/history`" />
        </template>
      </DetailViewTabs>
    </template>
  </ItemDetailLayout>

  <VDialog v-model="showDeleteConfirm" max-width="360" :transition="originDialogTransition" persistent>
    <VCard>
      <VCardText>{{ t("user.hco.detail.deleteConfirmText") }}</VCardText>
      <VCardActions>
        <VSpacer />
        <AppButton variant="text" @click="showDeleteConfirm = false">
          {{ t("app.common.cancel") }}
        </AppButton>
        <AppButton color="error" variant="text" :loading="deleteLoading" @click="onDelete">
          {{ t("user.hco.detail.delete") }}
        </AppButton>
      </VCardActions>
    </VCard>
  </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { originDialogTransition } from "@ui";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { usePermissions } from "../composables/usePermissions";
import { apiFetch } from "../composables/useApi";
import { useEntityCacheStore } from "../stores/entityCache";
import { useConfigStore } from "../stores/config";
import { useNotifications } from "../composables/useNotifications";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";
import DetailViewTabs from "../components/DetailViewTabs.vue";
import EntityHistoryPanel from "../components/EntityHistoryPanel.vue";
import RelatedEntityPanel from "../components/RelatedEntityPanel.vue";
import EntityDocumentsPanel from "../components/EntityDocumentsPanel.vue";
import HCOLocationMap from "../components/HCOLocationMap.vue";
import PatientNotesPanel from "../components/patient/PatientNotesPanel.vue";
import { hcoFormFields } from "../config/forms/hcoForm";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";
import {
  hcoTypeLabel as hcoTypeLabelFor,
  hcoStatusLabel as hcoStatusLabelFor,
  hcoTypeColor,
  hcoStatusColor,
} from "../utils/hcoLabels";

const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));
const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

const { canEditOrganizations, isAdmin } = usePermissions();

interface HCO {
  id: string;
  name: string;
  type?: string;
  region?: string;
  territory_id?: string | null;
  territory_name?: string | null;
  territory_path?: { id: string; name: string; code: string | null; kind: string }[] | null;
  status?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  google_link?: string;
  latitude?: number | null;
  longitude?: number | null;
  specialties?: string[];
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();
const { submit } = useEntitySubmit();
const configStore = useConfigStore();

const hcoTabs = [
  { value: "details", labelKey: "user.hco.detail.tabs.details" },
  { value: "notes", labelKey: "user.hco.detail.tabs.notes" },
  { value: "relatedDoctors", labelKey: "user.hco.detail.tabs.relatedDoctors" },
  { value: "documents", labelKey: "user.hco.detail.tabs.documents" },
  { value: "history", labelKey: "user.hco.detail.tabs.history" },
];
const activeTab = ref((route.query.tab as string) || "details");
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } });
});

function hcoTypeLabel(type?: string): string {
  return hcoTypeLabelFor(t, type);
}
function hcoStatusLabel(status?: string): string {
  return hcoStatusLabelFor(t, status);
}
function specialtyLabel(code: string): string {
  return configStore.specialtyItems.find((o) => o.value === code)?.title ?? code;
}

/** Same territory_path-with-region-fallback pattern as PatientDetailView's regionBreadcrumb. */
const territoryLabel = computed(() => {
  const path = hco.value?.territory_path;
  if (path && path.length > 0) {
    return path.map((node) => (node.code || node.name).toLowerCase()).join("/");
  }
  return hco.value?.territory_name || hco.value?.region || "—";
});

const hcoCache = useEntityCacheStore("hco");
const hco = ref<HCO | null>(null);
const loading = ref(true);
/** True while `hco` is being served from the offline cache — see docs/ADR-013-offline-read-cache.md. */
const isOffline = ref(false);
/** True when loadHCO() failed for a reason other than a genuine 404 (network/server) — see loadHCO(). */
const loadFailed = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<{ start_at: string; end_at: string; hcoIds?: string[] } | undefined>(undefined);

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    hcoIds: hco.value?.id ? [hco.value.id] : [],
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
  await submit(
    {
      request: () =>
        apiFetch("/api/v1/encounter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: payload.title,
            start_at: payload.start_at,
            end_at: payload.end_at,
            type: payload.type,
            status: payload.status,
            location: payload.location,
            video_link: payload.video_link,
            notes: payload.notes,
            region: payload.region,
            attendees: payload.attendees,
          }),
        }),
      successMessage: t("user.planner.form.success"),
      errorMessage: t("user.planner.form.errorSave"),
      refresh: false,
    },
    done,
  );
}

function onEdit() {
  showEditModal.value = true;
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = hco.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/organization/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.hco.detail.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "hco" });
  }
});

async function onAccountSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = hco.value?.id;
  if (!id) { done(false); return; }
  await submit(
    {
      request: () =>
        apiFetch(`/api/v1/organization/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }),
      successMessage: t("user.hco.form.editSuccess"),
      errorMessage: t("user.hco.form.errorSave"),
      onSuccess: () => loadHCO(),
    },
    done,
  );
}

async function loadHCO() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hco.value = null;
  loadFailed.value = false;
  try {
    const res = await apiFetch(`/api/v1/organization/${id}`, { handleErrors: false });
    if (res.ok) {
      hco.value = (await res.json()) as HCO;
      isOffline.value = false;
      void hcoCache.cacheOne(hco.value as unknown as Record<string, unknown>);
    } else if (res.status !== 404) {
      // Not a genuine 404 — ItemDetailLayout renders its own "connection
      // problem" + retry state for this (see :load-error), so no separate
      // toast on top of it.
      loadFailed.value = true;
    }
  } catch {
    // Network failure, not a server error — fall back to the cached record if we have one.
    const cached = await hcoCache.readOne(id);
    if (cached) {
      hco.value = cached as unknown as HCO;
      isOffline.value = true;
      return;
    }
    loadFailed.value = true;
    hco.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(loadHCO);
watch(() => route.params.id, loadHCO);
</script>

<style scoped>
.view-detail__offline-banner {
  margin: 0 0 12px;
}

.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hco-title-row {
  width: 100%;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.hco-title-row__badges {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hco-specialties {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hco-details-layout {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* Address + map move to their own right-hand column once there's room for
   both side by side — narrower than that, the map (with a real minimum
   useful size) would otherwise squeeze the main details column too thin. */
@media (min-width: 600px) {
  .hco-details-layout {
    flex-direction: row;
    align-items: flex-start;
  }
  .hco-details-layout__main {
    flex: 1 1 55%;
    min-width: 0;
  }
  .hco-details-layout__aside {
    flex: 1 1 45%;
    min-width: 0;
  }
}

.hco-contact-cards {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.hco-contact-cards__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--pwa-radius);
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
  transition: background-color 120ms ease;
}
.hco-contact-cards__item:hover {
  background: rgba(var(--v-theme-primary), 0.16);
}
</style>
