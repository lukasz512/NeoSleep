<template>
  <div class="view-detail">
    <FormRenderer
      v-model="showEditModal"
      :fields="userFormFields"
      :initial-data="user ?? undefined"
      title-key="user.users.form.title"
      edit-title-key="user.users.form.editTitle"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      avatar-entity-type="user"
      @submit="onSubmit"
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
      :has-content="!!user"
      :loading="loading"
      :load-error="loadFailed"
      :back-route="{ name: 'users' }"
      :back-label="t('user.users.detail.back')"
      :not-found-label="t('user.users.detail.notFound')"
      @retry="loadUser"
    >
      <template #title v-if="user">
        <span class="view-item__title-wrap">
          <AppAvatar :name="user.name" entity-type="user" :size="40" />
          <h1 class="view-item__title">{{ user.name }}</h1>
        </span>
      </template>
      <template #header-actions v-if="user">
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="resetPasswordLoading"
              :class="entityActionBtnClass('resetPassword')"
              :aria-label="t('user.users.actions.resetPassword')"
              @click="onResetPassword"
            >
              <AppIcon :name="entityActionIcon('resetPassword')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.users.actions.resetPassword') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="toggleStatusLoading"
              :class="[entityActionBtnClass('toggleStatus'), { 'view-item__action-btn--inactive': !isActive }]"
              :aria-label="t(isActive ? 'user.users.actions.disable' : 'user.users.actions.enable')"
              @click="onToggleStatus"
            >
              <AppIcon :name="entityActionIcon('toggleStatus')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t(isActive ? 'user.users.actions.disable' : 'user.users.actions.enable') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('edit')"
              :aria-label="t('user.users.detail.edit')"
              @click="onEdit"
            >
              <AppIcon :name="entityActionIcon('edit')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.users.detail.edit') }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :class="entityActionBtnClass('delete')"
              :aria-label="t('user.users.actions.delete')"
              @click="showDeleteConfirm = true"
            >
              <AppIcon :name="entityActionIcon('delete')" class="view-item__action-icon" />
            </AppButton>
          </template>
          <span>{{ t('user.users.actions.delete') }}</span>
        </VTooltip>
      </template>

      <template #sections v-if="user">
        <VTabs v-model="activeTab" density="compact" class="user-detail__tabs">
          <VTab value="details">{{ t("user.users.detail.tabs.details") }}</VTab>
          <VTab value="documents">{{ t("user.users.detail.tabs.documents") }}</VTab>
        </VTabs>
        <VWindow v-model="activeTab">
          <VWindowItem value="details">
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("user.users.detail.email") }}</dt>
              <dd class="view-item__value">
                <a v-if="user.email" :href="`mailto:${user.email}`" class="view-item__link">{{ user.email }}</a>
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("user.users.detail.role") }}</dt>
              <dd class="view-item__value">{{ t(`user.users.role.${roleKey}`) }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("user.users.detail.status") }}</dt>
              <dd class="view-item__value">{{ t(`user.users.status.${user.status}`) }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("user.users.detail.region") }}</dt>
              <dd class="view-item__value">{{ user.region || "—" }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">{{ t("user.users.detail.phone") }}</dt>
              <dd class="view-item__value">
                <a v-if="user.phone" :href="`tel:${user.phone}`" class="view-item__link">{{ user.phone }}</a>
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
          </VWindowItem>
          <VWindowItem value="documents">
            <AppLoadingState v-if="documentsLoading" />
            <p v-else-if="documents.length === 0" class="user-detail__documents-empty">
              {{ t("user.users.documents.empty") }}
            </p>
            <ul v-else class="user-detail__documents-list">
              <li v-for="doc in documents" :key="doc.id" class="user-detail__documents-item">
                <span class="user-detail__documents-type">
                  {{ t(`user.users.documents.type.${doc.documentType}`) }}
                </span>
                <span class="user-detail__documents-date">
                  {{ t("user.users.documents.signedAt") }} {{ new Date(doc.signedAt).toLocaleDateString() }}
                </span>
                <AppButton variant="text" size="small" @click="onDownloadDocument(doc.id)">
                  {{ t("user.users.documents.download") }}
                </AppButton>
              </li>
            </ul>
          </VWindowItem>
        </VWindow>
      </template>
    </ItemDetailLayout>

    <VDialog v-model="showDeleteConfirm" max-width="360" :transition="originDialogTransition" persistent>
      <VCard>
        <VCardText>{{ t("user.users.actions.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton color="error" variant="text" :loading="deleteLoading" @click="onDelete">
            {{ t("user.users.actions.delete") }}
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
import { apiFetch } from "../composables/useBffApi";
import { useEntityCacheStore } from "../stores/entityCache";
import { useNotifications } from "../composables/useNotifications";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import { userFormFields } from "../config/forms/userForm";
import { entityActionIcon, entityActionBtnClass } from "../config/entityActions";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

interface UserDetail {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  status: string;
  region: string | null;
  phone?: string | null;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();

interface UserDocument {
  id: string;
  documentType: string | null;
  filename: string | null;
  mimeType: string | null;
  signedAt: string;
}

const usersCache = useEntityCacheStore("users");
const user = ref<UserDetail | null>(null);
const loading = ref(true);
/** True while `user` is being served from the offline cache — see docs/ADR-013-offline-read-cache.md. */
const isOffline = ref(false);
/** True when loadUser() failed for a reason other than a genuine 404 (network/server) — see loadUser(). */
const loadFailed = ref(false);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const activeTab = ref<"details" | "documents">("details");
const documents = ref<UserDocument[]>([]);
const documentsLoading = ref(false);

const roleKey = computed(() => user.value?.role ?? "rep");
const isActive = computed(() => user.value?.status === "active");

function onEdit() {
  showEditModal.value = true;
}

async function onSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = user.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      notifications.show(t("user.users.form.editSuccess"), "success");
      await loadUser();
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const { loading: resetPasswordLoading, run: onResetPassword } = useAsyncAction(async () => {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}/reset-password`, {
    method: "POST",
  });
  if (res.ok) {
    notifications.show(t("user.users.actions.resetPasswordSuccess"), "success");
  }
});

const { loading: toggleStatusLoading, run: onToggleStatus } = useAsyncAction(async () => {
  const id = user.value?.id;
  if (!id) return;
  const nextStatus = isActive.value ? "inactive" : "active";
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus }),
  });
  if (res.ok) {
    notifications.show(
      t(nextStatus === "active" ? "user.users.actions.enableSuccess" : "user.users.actions.disableSuccess"),
      "success",
    );
    await loadUser();
  }
});

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.users.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "users" });
  }
});

async function loadUser() {
  const id = route.params.id as string;
  if (!id) { loading.value = false; return; }
  loading.value = true;
  user.value = null;
  loadFailed.value = false;
  try {
    // handleErrors: false — we branch ourselves below: 404 (genuinely doesn't
    // exist) shows ItemDetailLayout's not-found state; anything else (500,
    // network) shows its "connection problem" + retry state instead (see
    // :load-error) — no separate toast stacked on top of either.
    const res = await apiFetch(`/api/v1/users/${id}`, { handleErrors: false });
    if (res.ok) {
      user.value = (await res.json()) as UserDetail;
      isOffline.value = false;
      void usersCache.cacheOne(user.value as unknown as Record<string, unknown>);
    } else if (res.status !== 404) {
      loadFailed.value = true;
    }
  } catch {
    // Network failure, not a server error — fall back to the cached record if we have one.
    const cached = await usersCache.readOne(id);
    if (cached) {
      user.value = cached as unknown as UserDetail;
      isOffline.value = true;
    } else {
      loadFailed.value = true;
      user.value = null;
    }
  } finally {
    loading.value = false;
  }
}

async function loadDocuments() {
  const id = route.params.id as string;
  if (!id) return;
  documentsLoading.value = true;
  try {
    const res = await apiFetch(`/api/v1/users/${id}/documents`, { handleErrors: false });
    if (res.ok) {
      documents.value = (await res.json()) as UserDocument[];
    } else {
      notifications.show(t("user.users.documents.errorLoad"), "error");
    }
  } catch {
    notifications.show(t("user.users.documents.errorLoad"), "error");
  } finally {
    documentsLoading.value = false;
  }
}

async function onDownloadDocument(documentId: string) {
  const id = route.params.id as string;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}/documents/${documentId}/download`, { handleErrors: false });
  if (res.ok) {
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  } else {
    notifications.show(t("user.users.documents.errorLoad"), "error");
  }
}

onMounted(() => {
  loadUser();
  loadDocuments();
});
watch(() => route.params.id, () => {
  loadUser();
  loadDocuments();
});
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

.user-detail__tabs {
  margin-bottom: 16px;
}

.user-detail__documents-empty {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.user-detail__documents-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-detail__documents-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.user-detail__documents-type {
  font-weight: 500;
}

.user-detail__documents-date {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  font-size: 0.875rem;
  margin-right: auto;
}
</style>
