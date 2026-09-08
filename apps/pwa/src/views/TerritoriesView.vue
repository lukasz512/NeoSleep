<template>
  <div class="territories-view">
    <AppEntityList
      view-id="territories"
      api-endpoint="/api/v1/territory"
      :headers="tableHeaders"
      :i18n="territoriesI18n"
      :show-add-button="true"
      @add="onAdd"
    >
      <template #item.name="{ item }">
        {{ (item as TerritoryListItem).name }}
      </template>
      <template #item.code="{ item }">
        <span v-if="(item as TerritoryListItem).code">{{ (item as TerritoryListItem).code }}</span>
        <span v-else class="app-entity-list__cell-empty">—</span>
      </template>
      <template #item.kind="{ item }">
        {{ t(`user.territories.form.kind${kindPascal((item as TerritoryListItem).kind)}`) }}
      </template>
      <template #item.country_code="{ item }">
        {{ (item as TerritoryListItem).country_code }}
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as TerritoryListItem).name }}
      </template>
      <template #feed-card-meta="{ item }">
        {{ t(`user.territories.form.kind${kindPascal((item as TerritoryListItem).kind)}`) }} — {{ (item as TerritoryListItem).country_code }}
      </template>
      <template #feed-card-actions="{ item }">
        <AppListItemMenu :aria-label="t('app.common.moreActions')">
          <VListItem :title="t('user.territories.actions.edit')" @click="onEdit(item as TerritoryListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
          </VListItem>
          <VListItem :title="t('user.territories.actions.delete')" @click="onDeleteClick(item as TerritoryListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('delete')" :class="entityActionMenuIconClass('delete')" /></template>
          </VListItem>
        </AppListItemMenu>
      </template>
    </AppEntityList>

    <FormRenderer
      v-model="showAddModal"
      :fields="territoryFormFields"
      title-key="user.territories.form.title"
      submit-label-key="user.territories.form.submit"
      @submit="onSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="territoryFormFields"
      :initial-data="selectedTerritory ?? undefined"
      title-key="user.territories.form.title"
      edit-title-key="user.territories.form.editTitle"
      submit-label-key="user.territories.form.submit"
      edit-submit-label-key="user.territories.form.editSubmit"
      @submit="onEditSubmit"
    />

    <VDialog v-model="showDeleteConfirm" max-width="360" :transition="originDialogTransition" persistent>
      <VCard>
        <VCardText>{{ t("user.territories.actions.deleteConfirmText") }}</VCardText>
        <VCardActions>
          <VSpacer />
          <AppButton variant="text" @click="showDeleteConfirm = false">
            {{ t("app.common.cancel") }}
          </AppButton>
          <AppButton color="error" variant="text" :loading="deleteLoading" @click="onDelete">
            {{ t("user.territories.actions.delete") }}
          </AppButton>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent } from "vue";
import { originDialogTransition } from "@ui";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppButton from "../components/AppButton.vue";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { useAsyncAction } from "../composables/useAsyncAction";
import { territoryFormFields } from "../config/forms/territoryForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));

interface TerritoryListItem {
  id: string;
  name: string;
  code: string | null;
  country_code: string;
  parent_id: string | null;
  kind: string;
}

const { t } = useI18n();
const notifications = useNotifications();

const showAddModal = ref(false);
const showEditModal = ref(false);
const selectedTerritory = ref<TerritoryListItem | null>(null);
const showDeleteConfirm = ref(false);
const deletingId = ref<string | null>(null);

const tableHeaders = computed(() => [
  { title: t("user.territories.table.name"), key: "name", sortable: false },
  { title: t("user.territories.table.code"), key: "code", sortable: false },
  { title: t("user.territories.table.kind"), key: "kind", sortable: false },
  { title: t("user.territories.table.countryCode"), key: "country_code", sortable: false },
]);

const territoriesI18n = computed(() => ({
  searchPlaceholder: "user.territories.searchPlaceholder",
  filtersTitle: "user.territories.filters.title",
  filtersClear: "user.territories.filters.clear",
  add: "user.territories.add",
  emptyTitle: "user.territories.emptyTitle",
  emptySubtitle: "user.territories.emptySubtitle",
  noResultsForCriteria: "user.territories.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.territories.noResultsForCriteriaSubtitle",
  tableNoResults: "user.territories.table.noResults",
  errorLoad: "user.territories.errorLoad",
}));

function kindPascal(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function onAdd() {
  showAddModal.value = true;
}

function onEdit(territory: TerritoryListItem) {
  selectedTerritory.value = territory;
  showEditModal.value = true;
}

async function onSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/territory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      notifications.show(t("user.territories.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

async function onEditSubmit(payload: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedTerritory.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/territory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      notifications.show(t("user.territories.form.editSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onDeleteClick(territory: TerritoryListItem) {
  deletingId.value = territory.id;
  showDeleteConfirm.value = true;
}

const { loading: deleteLoading, run: onDelete } = useAsyncAction(async () => {
  const id = deletingId.value;
  if (!id) return;
  const res = await apiFetch(`/api/v1/territory/${id}`, { method: "DELETE" });
  if (res.ok) {
    showDeleteConfirm.value = false;
    deletingId.value = null;
    notifications.show(t("user.territories.actions.deleteSuccess"), "success");
    window.dispatchEvent(new Event("entity-list-refresh"));
  }
});
</script>

<style scoped>
.territories-view {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}
</style>
