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
    <AppInlineAlert
      v-if="isOffline"
      type="warning"
      class="view-detail__offline-banner"
      :text="t('app.common.offlineShowingCached')"
    />
    <ItemDetailLayout
      :has-content="!!user"
      :loading="loading"
      :load-error="loadFailed"
      :load-error-cause="loadFailure"
      :back-route="{ name: 'users' }"
      :back-label="t('user.users.detail.back')"
      :record-title="user?.name ?? ''"
      :not-found-label="t('user.users.detail.notFound')"
      @retry="loadUser"
    >
      <template v-if="user" #record-tile>
        <AppAvatar :name="user.name" entity-type="user" :first-name="user.first_name" :last-name="user.last_name" :size="48" />
      </template>
      <template v-if="user" #record-details>
        <IdentityDetails :details="[t(`user.users.role.${roleKey}`)]" />
      </template>
      <template v-if="user" #header-actions>
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
              <AppIcon
                :name="entityActionIcon('resetPassword')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.users.actions.resetPassword") }}</span>
        </VTooltip>
        <VTooltip location="bottom">
          <template #activator="{ props: tooltipProps }">
            <AppButton
              v-bind="tooltipProps"
              icon
              variant="flat"
              size="large"
              :loading="toggleStatusLoading"
              :class="[
                entityActionBtnClass('toggleStatus'),
                { 'view-item__action-btn--inactive': !isActive },
              ]"
              :aria-label="
                t(
                  isActive
                    ? 'user.users.actions.disable'
                    : 'user.users.actions.enable',
                )
              "
              @click="onToggleStatus"
            >
              <AppIcon
                :name="entityActionIcon('toggleStatus')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{
            t(
              isActive
                ? "user.users.actions.disable"
                : "user.users.actions.enable",
            )
          }}</span>
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
              <AppIcon
                :name="entityActionIcon('edit')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.users.detail.edit") }}</span>
        </VTooltip>
        <VTooltip v-if="isAdmin" location="bottom">
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
              <AppIcon
                :name="entityActionIcon('delete')"
                class="view-item__action-icon"
              />
            </AppButton>
          </template>
          <span>{{ t("user.users.actions.delete") }}</span>
        </VTooltip>
      </template>

      <template v-if="user" #sections>
        <DetailViewTabs v-model="activeTab" :tabs="userTabs">
          <template #details>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.email") }}
              </dt>
              <dd class="view-item__value">
                <a
                  v-if="user.email"
                  :href="`mailto:${user.email}`"
                  class="view-item__link"
                  >{{ user.email }}</a
                >
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.role") }}
              </dt>
              <dd class="view-item__value">
                {{ t(`user.users.role.${roleKey}`) }}
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.status") }}
              </dt>
              <dd class="view-item__value">
                {{ t(`user.users.status.${user.status}`) }}
              </dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.region") }}
              </dt>
              <dd class="view-item__value">{{ user.region || "—" }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.territory") }}
              </dt>
              <dd class="view-item__value">{{ user.territory_name || "—" }}</dd>
            </div>
            <div class="view-item__row">
              <dt class="view-item__label">
                {{ t("user.users.detail.phone") }}
              </dt>
              <dd class="view-item__value">
                <a
                  v-if="user.phone"
                  :href="`tel:${user.phone}`"
                  class="view-item__link"
                  >{{ user.phone }}</a
                >
                <span v-else class="view-item__empty">—</span>
              </dd>
            </div>
          </template>
          <template #documents>
            <AppLoadingState v-if="documentsLoading" />
            <p
              v-else-if="documents.length === 0"
              class="user-detail__documents-empty"
            >
              {{ t("user.users.documents.empty") }}
            </p>
            <ul v-else class="user-detail__documents-list">
              <li
                v-for="doc in documents"
                :key="doc.id"
                class="user-detail__documents-item"
              >
                <span class="user-detail__documents-type">
                  {{ t(`user.users.documents.type.${doc.documentType}`) }}
                </span>
                <span class="user-detail__documents-date">
                  {{ t("user.users.documents.signedAt") }}
                  {{ new Date(doc.signedAt).toLocaleDateString() }}
                </span>
                <AppButton
                  variant="text"
                  size="small"
                  @click="onDownloadDocument(doc.id)"
                >
                  {{ t("user.users.documents.download") }}
                </AppButton>
              </li>
            </ul>
          </template>
        </DetailViewTabs>
      </template>
    </ItemDetailLayout>

    <AppConfirmDialog
      v-model="showDeleteConfirm"
      :text="t('user.users.actions.deleteConfirmText')"
      :secondary-label="t('app.common.cancel')"
      :secondary-color="null"
      :primary-label="t('user.users.actions.delete')"
      primary-color="error"
      primary-variant="text"
      :loading="deleteLoading"
      max-width="360"
      @secondary="showDeleteConfirm = false"
      @primary="onDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { isOfflineError, reportCaught, reportFailedResponse } from "@api";
import { ref, computed, onMounted, watch, defineAsyncComponent } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../composables/useApi";
import { useEntityCacheStore } from "../stores/entityCache";
import { retryAction, useNotifications } from "../composables/useNotifications";
import { useEntitySubmit } from "../composables/useEntitySubmit";
import { useAsyncAction } from "../composables/useAsyncAction";
import ItemDetailLayout from "../components/ItemDetailLayout.vue";
import DetailViewTabs from "../components/DetailViewTabs.vue";
import AppButton from "../components/AppButton.vue";
import AppConfirmDialog from "../components/AppConfirmDialog.vue";
import AppIcon from "../components/AppIcon.vue";
import AppAvatar from "../components/AppAvatar.vue";
import IdentityDetails from "../components/IdentityDetails.vue";
import AppLoadingState from "../components/AppLoadingState.vue";
import { userFormFields } from "../config/forms/userForm";
import {
  entityActionIcon,
  entityActionBtnClass,
} from "../config/entityActions";
import { useAuthStore } from "../stores/auth";
import { AppInlineAlert } from "@ui";

const FormRenderer = defineAsyncComponent(
  () => import("../components/FormRenderer.vue"),
);

interface UserDetail {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  status: string;
  region: string | null;
  territory_id: string | null;
  territory_name: string | null;
  phone?: string | null;
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const notifications = useNotifications();
const { submit } = useEntitySubmit();
const authStore = useAuthStore();
const isAdmin = computed(() => authStore.user?.role === "admin");

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
/** The error behind loadFailed (NEO-81) — lets the error state say offline vs. server problem. */
const loadFailure = ref<unknown>(null);
const showEditModal = ref(false);
const showDeleteConfirm = ref(false);
const userTabs = [
  { value: "details", labelKey: "user.users.detail.tabs.details" },
  { value: "documents", labelKey: "user.users.detail.tabs.documents" },
];
/** Deep-linkable via ?tab= — same pattern as Patient/HCP/HCO detail views. */
const activeTab = ref((route.query.tab as string) || "details");
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab } });
});
const documents = ref<UserDocument[]>([]);
const documentsLoading = ref(false);

const roleKey = computed(() => user.value?.role ?? "rep");
const isActive = computed(() => user.value?.status === "active");

function onEdit() {
  showEditModal.value = true;
}

async function onSubmit(
  payload: Record<string, unknown>,
  done: (ok: boolean) => void,
) {
  const id = user.value?.id;
  if (!id) {
    done(false);
    return;
  }
  await submit(
    {
      request: () =>
        apiFetch(`/api/v1/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      successMessage: t("user.users.form.editSuccess"),
      icon: "nav-users",
      context: user.value?.name,
      errorMessage: t("user.users.form.errorSave"),
      onSuccess: () => loadUser(),
    },
    done,
  );
}

const { loading: resetPasswordLoading, run: onResetPassword } = useAsyncAction(
  async () => {
    const id = user.value?.id;
    if (!id) return;
    const res = await apiFetch(`/api/v1/users/${id}/reset-password`, {
      method: "POST",
    });
    if (res.ok) {
      notifications.show(
        t("user.users.actions.resetPasswordSuccess"),
        "success",
        undefined,
        { icon: "key", context: user.value?.name },
      );
    }
  },
);

const { loading: toggleStatusLoading, run: onToggleStatus } = useAsyncAction(
  async () => {
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
        t(
          nextStatus === "active"
            ? "user.users.actions.enableSuccess"
            : "user.users.actions.disableSuccess",
        ),
        "success",
        undefined,
        { icon: "nav-users", context: user.value?.name },
      );
      await loadUser();
    }
  },
);

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = user.value?.id;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    notifications.show(t("user.users.actions.deleteSuccess"), "success", undefined, { icon: "nav-users", context: user.value?.name });
    window.dispatchEvent(new Event("entity-list-refresh"));
    router.push({ name: "users" });
  }
});

async function loadUser() {
  const id = route.params.id as string;
  if (!id) {
    loading.value = false;
    return;
  }
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
      void usersCache.cacheOne(
        user.value as unknown as Record<string, unknown>,
      );
    } else if (res.status !== 404) {
      loadFailure.value = await reportFailedResponse(res, { where: "UserDetailView.load", path: "/api/v1/users/:id" });
      loadFailed.value = true;
    }
  } catch (err) {
    reportCaught(err, { where: "UserDetailView.load" });
    loadFailure.value = err;
    // Only a request that never reached the server may fall back to the cached record (ADR-013) —
    // a bad response or a bug shows the real error instead of stale data.
    const cached = isOfflineError(err) ? await usersCache.readOne(id) : null;
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
    const res = await apiFetch(`/api/v1/users/${id}/documents`, {
      handleErrors: false,
    });
    if (res.ok) {
      documents.value = (await res.json()) as UserDocument[];
    } else {
      notifications.show(t("user.users.documents.errorLoad"), "error", undefined, { icon: "file", context: user.value?.name, action: retryAction(loadDocuments) });
    }
  } catch (err) {
    reportCaught(err, { where: "UserDetailView.loadDocuments" });
    notifications.show(t("user.users.documents.errorLoad"), "error", undefined, { icon: "file", context: user.value?.name, action: retryAction(loadDocuments) });
  } finally {
    documentsLoading.value = false;
  }
}

async function onDownloadDocument(documentId: string) {
  const id = route.params.id as string;
  if (!id) return;
  const res = await apiFetch(
    `/api/v1/users/${id}/documents/${documentId}/download`,
    { handleErrors: false },
  );
  if (res.ok) {
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank", "noopener");
  } else {
    notifications.show(t("user.users.documents.errorLoad"), "error", undefined, {
      icon: "file",
      context: user.value?.name,
      action: retryAction(() => onDownloadDocument(documentId)),
    });
  }
}

onMounted(() => {
  loadUser();
  loadDocuments();
});
watch(
  () => route.params.id,
  () => {
    loadUser();
    loadDocuments();
  },
);
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
