<template>
  <div class="hco-view">
    <FormRenderer
      v-model="showAddModal"
      :fields="hcoFormFields"
      title-key="user.hco.form.title"
      submit-label-key="user.hco.form.submit"
      avatar-entity-type="hco"
      @submit="onAccountSubmit"
    />
    <FormRenderer
      v-model="showEditModal"
      :fields="hcoFormFields"
      :initial-data="selectedHco ?? undefined"
      title-key="user.hco.form.title"
      edit-title-key="user.hco.form.editTitle"
      submit-label-key="user.hco.form.submit"
      edit-submit-label-key="user.hco.form.editSubmit"
      avatar-entity-type="hco"
      @submit="onEditSubmit"
    />
    <EventForm
      v-model="showEventForm"
      :initial-data="eventFormInitial"
      @submit="onEventFormSubmit"
    />
    <!-- HCOs can only be created through the lead -> invite-to-partner pipeline (see LeadDetailView.vue) -->
    <AppEntityList
      view-id="hco"
      api-endpoint="/api/v1/organization"
      :headers="tableHeaders"
      :filter-definitions="hcoFilterDefinitions"
      :i18n="hcoI18n"
      :show-add-button="false"
      detail-route-name="hco-detail"
      :filter-param-keys="['type', 'region', 'status']"
      @add="onAddAccount"
    >
      <template #item.name="{ item }">
        <span class="hco-name-cell">
          <AppAvatar :name="(item as HCOListItem).name" entity-type="hco" :size="32" />
          {{ (item as HCOListItem).name }}
        </span>
      </template>
      <template #feed-card-avatar="{ item }">
        <AppAvatar :name="(item as HCOListItem).name" entity-type="hco" :size="55" />
      </template>
      <template #feed-card-title="{ item }">
        {{ (item as HCOListItem).name }}
      </template>
      <template #feed-card-meta="{ item }">
        {{ hcoTypeLabel((item as HCOListItem).type) }}
      </template>
      <template #feed-card-status="{ item }">
        <VChip :color="hcoStatusColor((item as HCOListItem).status)" size="x-small" variant="tonal">
          {{ hcoStatusLabel((item as HCOListItem).status) }}
        </VChip>
      </template>
      <template #feed-card-actions="{ item }">
        <AppListItemMenu :aria-label="t('app.common.moreActions')">
          <VListItem :title="t('user.detail.scheduleVisit')" @click="onScheduleVisit(item as HCOListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('scheduleVisit')" :class="entityActionMenuIconClass('scheduleVisit')" /></template>
          </VListItem>
          <VListItem v-if="isAdmin" :title="t('user.hco.detail.edit')" @click="onEditAccount(item as HCOListItem)">
            <template #prepend><AppIcon :name="entityActionIcon('edit')" :class="entityActionMenuIconClass('edit')" /></template>
          </VListItem>
        </AppListItemMenu>
      </template>
    </AppEntityList>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineAsyncComponent } from "vue";
import { useI18n } from "vue-i18n";
import AppEntityList from "../components/AppEntityList.vue";
import AppAvatar from "../components/AppAvatar.vue";
import AppIcon from "../components/AppIcon.vue";
import AppListItemMenu from "../components/AppListItemMenu.vue";
import { entityActionIcon, entityActionMenuIconClass } from "../config/entityActions";
import { type FilterDefinition } from "../composables/useFilters";
import { useAuthStore } from "../stores/auth";
import { useConfigStore } from "../stores/config";
import { apiFetch } from "../composables/useApi";
import { useNotifications } from "../composables/useNotifications";
import { hcoFormFields } from "../config/forms/hcoForm";

const FormRenderer = defineAsyncComponent(() => import("../components/FormRenderer.vue"));
const EventForm = defineAsyncComponent(() => import("../components/EventForm.vue"));

interface HCOListItem {
  id: string;
  name?: string;
  type?: string;
  region?: string;
  status?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  specialties?: string[];
}

const { t } = useI18n();
const authStore = useAuthStore();
const configStore = useConfigStore();
const notifications = useNotifications();
const isAdmin = computed(() => authStore.user?.role === "admin");
const showAddModal = ref(false);
const showEditModal = ref(false);
const showEventForm = ref(false);
const selectedHco = ref<HCOListItem | null>(null);
const eventFormInitial = ref<{ start_at: string; end_at: string; hcoIds?: string[] } | undefined>(undefined);

const hcoFilterDefs: FilterDefinition[] = [
  { key: "type", labelKey: "user.hco.filters.type", type: "select", default: "" },
  { key: "region", labelKey: "user.hco.filters.region", type: "select", default: "" },
  { key: "status", labelKey: "user.hco.filters.status", type: "select", default: "" },
];

// Values match the real organization_type/organization_status CHECK constraints
// (infrastructure/db/schema-snapshot.sql) — not the UI's own invented vocabulary.
const typeOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  { title: t("user.hco.filters.typeClinic"), value: "clinic" },
  { title: t("user.hco.filters.typeHospital"), value: "hospital" },
  { title: t("user.hco.filters.typePharmacy"), value: "pharmacy" },
  { title: t("user.hco.filters.typePractice"), value: "practice" },
  { title: t("user.hco.filters.typeOther"), value: "other" },
]);
const regionOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  ...configStore.regionItems,
]);
const statusOptions = computed(() => [
  { title: t("user.hco.filters.all"), value: "" },
  { title: t("user.hco.filters.statusActive"), value: "active" },
  { title: t("user.hco.filters.statusInactive"), value: "inactive" },
  { title: t("user.hco.filters.statusPendingApproval"), value: "pending_approval" },
]);

const hcoFilterDefinitions = computed<FilterDefinition[]>(() => [
  { ...hcoFilterDefs[0], options: typeOptions.value },
  { ...hcoFilterDefs[1], options: regionOptions.value },
  { ...hcoFilterDefs[2], options: statusOptions.value },
]);

const tableHeaders = computed(() => [
  { title: t("user.hco.table.name"), key: "name", sortable: true },
  { title: t("user.hco.table.type"), key: "type", sortable: true },
  { title: t("user.hco.table.region"), key: "region", sortable: true },
  { title: t("user.hco.table.status"), key: "status", sortable: true },
]);

const hcoI18n = computed(() => ({
  searchPlaceholder: "user.hco.searchPlaceholder",
  filtersTitle: "user.hco.filters.title",
  filtersClear: "user.hco.filters.clear",
  add: "user.hco.add",
  emptyTitle: "user.hco.emptyTitle",
  emptySubtitle: "user.hco.emptySubtitle",
  noResultsForCriteria: "user.hco.noResultsForCriteria",
  noResultsForCriteriaSubtitle: "user.hco.noResultsForCriteriaSubtitle",
  tableNoResults: "user.hco.table.noResults",
  errorLoad: "user.hco.errorLoad",
}));

function hcoTypeLabel(type?: string): string {
  return typeOptions.value.find((o) => o.value === type)?.title ?? (type ?? "");
}

function hcoStatusLabel(status?: string): string {
  return statusOptions.value.find((o) => o.value === status)?.title ?? (status ?? "");
}

function hcoStatusColor(status?: string): string {
  switch (status) {
    case "active":           return "success";
    case "pending_approval": return "warning";
    default:                 return "default";
  }
}

function onAddAccount() {
  showAddModal.value = true;
}

async function onAccountSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  try {
    const res = await apiFetch("/api/v1/organization", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.hco.form.success"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onEditAccount(hco: HCOListItem) {
  selectedHco.value = hco;
  showEditModal.value = true;
}

async function onEditSubmit(data: Record<string, unknown>, done: (ok: boolean) => void) {
  const id = selectedHco.value?.id;
  if (!id) { done(false); return; }
  try {
    const res = await apiFetch(`/api/v1/organization/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      notifications.show(t("user.hco.form.editSuccess"), "success");
      window.dispatchEvent(new Event("entity-list-refresh"));
      done(true);
    } else {
      done(false);
    }
  } catch {
    done(false);
  }
}

function onScheduleVisit(hco: HCOListItem) {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  eventFormInitial.value = {
    start_at: new Date(`${date} 09:00`).toISOString(),
    end_at: new Date(`${date} 10:00`).toISOString(),
    hcoIds: hco.id ? [hco.id] : [],
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
      body: JSON.stringify({ title: payload.title, start_at: payload.start_at, end_at: payload.end_at, type: payload.type, status: payload.status, location: payload.location, video_link: payload.video_link, notes: payload.notes, region: payload.region, attendees: payload.attendees }),
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
</script>

<style scoped>
.hco-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>

