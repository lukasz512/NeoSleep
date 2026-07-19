<template>
  <div class="users-view">
    <AppEntityList
      view-id="users"
      api-endpoint="/api/v1/users"
      :headers="tableHeaders"
      :filter-definitions="usersFilterDefinitions"
      :i18n="usersI18n"
      :show-add-button="true"
      detail-route-name="user-detail"
      :filter-param-keys="['role', 'status']"
      :loading-item-id="loadingItemId"
      @add="onAdd"
    >
      <template #item.name="{ item }">
        <span class="users-name-cell">
          <AppAvatar :name="(item as { name?: string }).name" entity-type="user" :size="32" />
          {{ (item as { name?: string }).name }}
        </span>
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as { name?: string }).name" entity-type="user" size="100%" />
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as { name?: string }).name }}
      </template>
      <template #item.role="{ item }">
        {{ t(`user.users.role.${roleKeyOf(item as Record<string, unknown>)}`) }}
      </template>
      <template #item.status="{ item }">
        <span :class="['users-view__status', `users-view__status--${(item as Record<string, unknown>).status}`]">
          {{ t(`user.users.status.${(item as Record<string, unknown>).status}`) }}
        </span>
      </template>
      <template #feed-card-meta="{ item }">
        {{ t(`user.users.role.${roleKeyOf(item as Record<string, unknown>)}`) }}
      </template>
      <template #feed-card-status="{ item }">
        <span :class="['users-view__status', `users-view__status--${(item as Record<string, unknown>).status}`]">
          {{ t(`user.users.status.${(item as Record<string, unknown>).status}`) }}
        </span>
      </template>
      <template #feed-card-actions="{ item }">
        <AppListItemMenu :aria-label="t('app.common.moreActions')">
          <VListItem :title="t('user.users.actions.resetPassword')" @click="onResetPasswordClick(item as UserListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('resetPassword')" :class="entityActionMenuIconClass('resetPassword')" /></template>
          </VListItem>
          <VListItem
            :title="t((item as UserListItem).status === 'active' ? 'user.users.actions.disable' : 'user.users.actions.enable')"
            @click="onToggleStatusClick(item as UserListItem)"
          >
            <template #prepend><AppIcon :name="entityActionIcon('toggleStatus')" :class="entityActionMenuIconClass('toggleStatus')" /></template>
          </VListItem>
          <VListItem :title="t('user.users.actions.edit')" @click="onEditUser(item as UserListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
          </VListItem>
          <VListItem :title="t('user.users.actions.delete')" @click="onDeleteClick(item as UserListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('delete')" :class="entityActionMenuIconClass('delete')" /></template>
          </VListItem>
        </AppListItemMenu>
      </template>
    </AppEntityList>

    <FormRenderer
      v-model="showForm"
      :fields="userFormFields"
      title-key="user.users.form.title"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      avatar-entity-type="user"
      @submit="onSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="userFormFields"
      :initial-data="selectedUser ?? undefined"
      title-key="user.users.form.title"
      edit-title-key="user.users.form.editTitle"
      submit-label-key="user.users.form.submit"
      edit-submit-label-key="user.users.form.editSubmit"
      avatar-entity-type="user"
      @submit="onEditSubmit"
    />

    <VDialog v-model="showDeleteConfirm" max-width="360" persistent>
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
import { ref, computed, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { apiFetch } from "../utils/api";
import { useNotifications } from "../composables/useNotifications";
import { useAsyncAction } from "../composables/useAsyncAction";
import type { FilterDefinition } from "../composables/useFilters";
import { userFormFields } from "../config/forms/userForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

interface UserListItem {
  id: string;
  name?: string;
  role?: string;
  status?: string;
}

const { t } = useI18n();
const notifications = useNotifications();

const showForm = ref(false);
const showEditModal = ref(false);
const selectedUser = ref<UserListItem | null>(null);
const loadingItemId = ref<string | null>(null);
const showDeleteConfirm = ref(false);
const deletingUserId = ref<string | null>(null);

const usersFilterDefs: FilterDefinition[] = [
  { key: "role", labelKey: "user.users.filters.role", type: "select", default: "" },
  { key: "status", labelKey: "user.users.filters.status", type: "select", default: "" },
];

const roleFilterOptions = computed(() => [
  { title: t("user.users.filters.all"), value: "" },
  { title: t("user.users.role.admin"), value: "admin" },
  { title: t("user.users.role.manager"), value: "manager" },
  { title: t("user.users.role.rep"), value: "rep" },
  { title: t("user.users.role.doctor"), value: "doctor" },
]);
const statusFilterOptions = computed(() => [
  { title: t("user.users.filters.all"), value: "" },
  { title: t("user.users.status.active"), value: "active" },
  { title: t("user.users.status.inactive"), value: "inactive" },
  { title: t("user.users.status.suspended"), value: "suspended" },
]);

const usersFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...usersFilterDefs[0], options: roleFilterOptions.value },
  { ...usersFilterDefs[1], options: statusFilterOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.users.table.name"), key: "name", sortable: true },
  { title: t("user.users.table.email"), key: "email", sortable: true },
  { title: t("user.users.table.role"), key: "role", sortable: false },
  { title: t("user.users.table.status"), key: "status", sortable: true },
]);

const usersI18n = computed(() => ({
  searchPlaceholder: "user.users.searchPlaceholder",
  filtersTitle: "user.users.filters.title",
  filtersClear: "user.users.filters.clear",
  add: "user.users.add",
  emptyTitle: "user.users.emptyTitle",
  emptySubtitle: "user.users.emptySubtitle",
  noResultsForCriteria: "user.users.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.users.noResultsForCriteriaSubtitle",
  tableNoResults: "user.users.table.noResults",
  errorLoad: "user.users.errorLoad",
}));

function roleKeyOf(item: Record<string, unknown>): string {
  return String(item.role ?? "rep");
}

function onAdd() {
  showForm.value = true;
}

function onEditUser(user: UserListItem) {
  selectedUser.value = user;
  showEditModal.value = true;
}

async function onEditSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedUser.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      notifications.show(t("user.users.form.editSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

const { run: onResetPassword } = useAsyncAction(async (user: UserListItem) => {
  const res = await apiFetch(`/api/v1/users/${user.id}/reset-password`, {
    method: "POST",
  });
  if (res.ok) {
    notifications.show(t("user.users.actions.resetPasswordSuccess"), "success");
  }
});

const { run: onToggleStatus } = useAsyncAction(async (user: UserListItem) => {
  const nextStatus = user.status === "active" ? "inactive" : "active";
  const res = await apiFetch(`/api/v1/users/${user.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: nextStatus }),
  });
  if (res.ok) {
    notifications.show(
      t(nextStatus === "active" ? "user.users.actions.enableSuccess" : "user.users.actions.disableSuccess"),
      "success",
    );
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
});

/**
 * These two actions fire immediately (no dialog) — the tile itself is the
 * only feedback surface, so it shows the bottom loader while the request is
 * in flight and the rest of the list dims (AppEntityList's loadingItemId).
 */
async function onResetPasswordClick(user: UserListItem) {
  loadingItemId.value = user.id;
  try {
    await onResetPassword(user);
  } finally {
    loadingItemId.value = null;
  }
}

async function onToggleStatusClick(user: UserListItem) {
  loadingItemId.value = user.id;
  try {
    await onToggleStatus(user);
  } finally {
    loadingItemId.value = null;
  }
}

function onDeleteClick(user: UserListItem) {
  deletingUserId.value = user.id;
  showDeleteConfirm.value = true;
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = deletingUserId.value;
  if (!id) return;
  const res = await apiFetch(`/api/v1/users/${id}`, {
    method: "DELETE",
  });
  if (res.ok) {
    showDeleteConfirm.value = false;
    deletingUserId.value = null;
    notifications.show(t("user.users.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
});

async function onSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      notifications.show(t("user.users.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}
</script>

<style scoped>
.users-view {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.users-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.users-view__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.users-view__status--active {
  background: rgba(var(--v-theme-success), 0.12);
  color: rgb(var(--v-theme-success));
}

.users-view__status--inactive,
.users-view__status--suspended {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
