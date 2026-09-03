<template>
  <div class="view-detail">
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="hcpFormFields"
      :derive="hcpFormDerive"
      :initial-data="hcpFormInitialData"
      title-key="user.hcp.form.title"
      edit-title-key="user.hcp.form.editTitle"
      submit-label-key="user.hcp.form.submit"
      edit-submit-label-key="user.hcp.form.editSubmit"
      avatar-entity-type="hcp"
      @submit="onContactSubmit"
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
      :has-content="!!hcp"
      :loading="loading"
      :load-error="loadFailed"
      :back-route="{ name: 'hcp' }"
      :back-label="t('user.hcp.detail.back')"
      :not-found-label="t('user.hcp.detail.notFound')"
      :title="hcp?.name"
      @retry="loadHCP"
    >
      <template v-if="hcp" #header-actions>
        <VTooltip
          v-if="canActivate && hcp.status === 'pending_approval'"
          location="bottom"
        >
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="activateLoading"
              :class="entityActionBtnClass('activatePractitioner')"
              :aria-label="t('user.hcp.detail.activate')"
              @click="onActivate"
            >
              <AppIcon
                :name="entityActionIcon('activatePractitioner')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.hcp.detail.activate") }}</span>
        </VTooltip>
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
              <AppIcon
                :name="entityActionIcon('scheduleVisit')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.detail.scheduleVisit") }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('edit')"
              :aria-label="t('user.hcp.detail.edit')"
              @click="onEdit"
            >
              <AppIcon
                :name="entityActionIcon('edit')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.hcp.detail.edit") }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('delete')"
              :aria-label="t('user.hcp.actions.delete')"
              @click="showDeleteConfirm = true"
            >
              <AppIcon
                :name="entityActionIcon('delete')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.hcp.actions.delete") }}</span>
        </VTooltip>
      </template>
      <template v-if="hcp" #title>
        <span class="view-item__title-wrap">
          <AppAvatar :name="hcp.name" entity-type="hcp" :size="40" />
          <h1 class="view-item__title">{{ hcp.name }}</h1>
        </span>
      </template>
      <template v-if="hcp" #sections>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.hcp.detail.email") }}</dt>
          <dd class="view-item__value">
            <a
              v-if="hcp.email"
              :href="`mailto:${hcp.email}`"
              class="view-item__link"
              >{{ hcp.email }}</a
            >
            <span v-else class="view-item__empty">—</span>
          </dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.hcp.detail.specialty") }}</dt>
          <dd class="view-item__value">{{ hcp.specialty || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">
            {{ t("user.hcp.detail.institution") }}
          </dt>
          <dd class="view-item__value">{{ hcp.institution || "—" }}</dd>
        </div>
        <div class="view-item__row">
          <dt class="view-item__label">{{ t("user.hcp.detail.region") }}</dt>
          <dd class="view-item__value">{{ hcp.region || "—" }}</dd>
        </div>
      </template>
    </ItemDetailLayout>

    <VDialog
      v-model="showDeleteConfirm"
      max-width="360"
      :transition="originDialogTransition"
      persistent
    >
      <VCard>
        <VCardText>{{ t("user.hcp.actions.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton
            color="error"
            variant="text"
            :loading="deleteLoading"
            @click="onDelete"
          >
            {{ t("user.hcp.actions.delete") }}
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
import { useAuthStore } from "../stores/auth";
import { apiFetch } from "../composables/useApi";
import { useEntityCacheStore } from "../stores/entityCache";
import { useNotifications } from "../composables/useNotifications";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppAvatar from "../components/AppAvatar.vue";
import { hcpFormFields, hcpFormDerive } from "../config/forms/hcpForm";
import {
  entityActionIcon,
  entityActionBtnClass,
} from "../config/entityActions";

const FormRenderer = defineAsyncComponent(
  () => import("../components/FormRenderer.vue"),
);
const EventForm = defineAsyncComponent(
  () => import("../components/EventForm.vue"),
);

interface HCP {
  id: string;
  name: string;
  salutation?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  primary_specialty?: string;
  organization_id?: string | null;
  institution?: string;
  region?: string;
  influence_tier?: string;
  language?: string | null;
  national_ids?: Record<string, string> | null;
  social_links?: Record<string, unknown> | null;
  status?: string;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");
const canActivate = computed(
  () => authStore.user?.role === "admin" || authStore.user?.role === "manager",
);

const hcpCache = useEntityCacheStore("hcp");
const hcp = ref<HCP | null>(null);
const loading = ref(true);
/** True while `hcp` is being served from the offline cache — see docs/ADR-013-offline-read-cache.md. */
const isOffline = ref(false);
/** True when loadHCP() failed for a reason other than a genuine 404 (network/server) — see loadHCP(). */
const loadFailed = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const showEventForm = ref(false);
const eventFormInitial = ref<
  { start_at: string; end_at: string; hcpIds?: string[] } | undefined
>(undefined);

/**
 * Must stay a computed (stable reference until `hcp.value` itself changes),
 * not an inline object literal in the template — FormRenderer's watch keys
 * off this object's identity to decide when to call resetForm(). A fresh
 * literal on every parent re-render (e.g. from unrelated reactive state like
 * `loading` or tooltip hover) would silently reset the open form and its
 * dirty snapshot together, making the discard-changes confirmation never
 * trigger. See LeadDetailView/HCODetailView/PatientDetailView, which pass
 * their entity ref directly for the same reason.
 */
const hcpFormInitialData = computed(() =>
  hcp.value
    ? {
        id: hcp.value.id,
        salutation: hcp.value.salutation ?? "",
        first_name: hcp.value.first_name ?? "",
        last_name: hcp.value.last_name ?? "",
        email: hcp.value.email ?? "",
        phone: hcp.value.phone ?? "",
        primary_specialty:
          hcp.value.primary_specialty ?? hcp.value.specialty ?? "",
        organization_id: hcp.value.organization_id ?? "",
        region: hcp.value.region ?? "",
        influence_tier: hcp.value.influence_tier ?? "A",
        language: hcp.value.language ?? "",
        national_ids: hcp.value.national_ids ?? null,
        social_links: hcp.value.social_links ?? null,
      }
    : undefined,
);

function onScheduleVisit() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const start = `${date} 09:00`;
  const end = `${date} 10:00`;
  eventFormInitial.value = {
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
    hcpIds: hcp.value?.id ? [hcp.value.id] : [],
  };
  showEventForm.value = true;
}

async function onEventFormSubmit(
  payload: import("../components/EventForm.vue").EventSubmitPayload,
  done: (ok: boolean) => void,
) {
  try {
    const res = await apiFetch("/api/v1/encounter", {
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
    });
    if (res.ok) {
      notifications.show(t("user.planner.form.success"), "success");
      done(true);
    } else {
      notifications.show(t("user.planner.form.errorSave"), "error");
      done(false);
    }
  } catch {
    notifications.show(t("user.planner.form.errorSave"), "error");
    done(false);
  }
}

function onEdit() {
  showEditModal.value = true;
}

const { loading: activateLoading, run: onActivate } = useAsyncAction(
  async () => {
    const id = hcp.value?.id;
    if (!id) return;
    const res = await apiFetch(`/api/v1/practitioner/${id}/activate`, {
      method: "POST",
    });
    if (res.ok) {
      notifications.show(t("user.hcp.detail.activateSuccess"), "success");
      await loadHCP();
      window.dispatchEvent(new Event("entity-list-refresh"));
    }
  },
);

async function onContactSubmit(
  data: Record<string, unknown>,
  done: (ok: boolean) => void,
) {
  const id = hcp.value?.id;
  if (!id) {
    done(false);
    return;
  }
  try {
    const res = await apiFetch(`/api/v1/practitioner/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.hcp.form.editSuccess"), "success");
      await loadHCP();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = hcp.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/practitioner/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.hcp.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "hcp" });
  }
});

async function loadHCP() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
  loading.value = true;
  hcp.value = null;
  loadFailed.value = false;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${id}`, {
      handleErrors: false,
    });
    if (res.ok) {
      hcp.value = (await res.json()) as HCP;
      isOffline.value = false;
      void hcpCache.cacheOne(hcp.value as unknown as Record<string, unknown>);
    } else if (res.status !== 404) {
      // Not a genuine 404 — ItemDetailLayout renders its own "connection
      // problem" + retry state for this (see :load-error), so no separate
      // toast on top of it.
      loadFailed.value = true;
    }
  } catch {
    // Network failure, not a server error — fall back to the cached record if we have one.
    const cached = await hcpCache.readOne(id);
    if (cached) {
      hcp.value = cached as unknown as HCP;
      isOffline.value = true;
    } else {
      loadFailed.value = true;
      hcp.value = null;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(loadHCP);
watch(() => route.params.id, loadHCP);
</script>

<style scoped>
.view-detail {
  min-height: 0;
}

.view-detail__offline-banner {
  margin: 0 0 12px;
}

.view-item__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
