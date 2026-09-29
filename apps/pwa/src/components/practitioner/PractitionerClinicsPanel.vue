<template>
  <div class="practitioner-clinics-panel">
    <div v-if="canManage" class="practitioner-clinics-panel__add">
      <VAutocomplete
        v-model="selectedOrgId"
        :label="t('user.hcp.detail.clinics.addLabel')"
        :placeholder="t('user.hcp.detail.clinics.addPlaceholder')"
        :items="availableOrgOptions"
        item-title="name"
        item-value="id"
        variant="outlined"
        density="comfortable"
        hide-details
        :loading="loadingOrgOptions"
        class="practitioner-clinics-panel__add-field"
      >
        <template #item="{ internalItem: item, props: itemProps }">
          <VListItem v-bind="itemProps" :title="item.raw.name">
            <template #prepend>
              <AppAvatar :name="item.raw.name" entity-type="hco" :size="28" />
            </template>
          </VListItem>
        </template>
      </VAutocomplete>
      <AppButton
        color="primary"
        :disabled="!selectedOrgId"
        :loading="addLoading"
        @click="onAdd"
      >
        {{ t("user.hcp.detail.clinics.addLabel") }}
      </AppButton>
    </div>

    <AppEmptyState v-if="organizations.length === 0" :title="t('user.hcp.detail.clinics.empty')" />
    <ul v-else class="practitioner-clinics-panel__list">
      <li v-for="org in organizations" :key="org.id" class="practitioner-clinics-panel__item">
        <div class="practitioner-clinics-panel__item-main">
          <EntityLink
            :to="hcoDetailLink(org.organization_id)"
            :label="org.name"
            :details="orgDetails(org).details"
            :avatar-size="32"
            class="practitioner-clinics-panel__name"
          />
        </div>
        <span v-if="org.address_line1 || org.city" class="practitioner-clinics-panel__address">
          {{ [org.address_line1, org.city].filter(Boolean).join(", ") }}
        </span>
        <div class="practitioner-clinics-panel__actions">
          <VTooltip location="bottom">
            <template #activator="{ props: tooltipProps }">
              <AppButton
                v-bind="tooltipProps"
                icon
                variant="text"
                size="small"
                :disabled="!isAdminOrManager"
                :loading="busyOrgId === org.organization_id && busyAction === 'default'"
                :aria-label="t('user.hcp.detail.clinics.primaryDefaultSet')"
                @click="onSetPrimary(org.organization_id, 'default')"
              >
                <AppIcon :name="org.is_primary ? 'star' : 'star-outline'" />
              </AppButton>
            </template>
            <span>{{ t("user.hcp.detail.clinics.primaryDefault") }}</span>
          </VTooltip>
          <VTooltip v-if="isRep" location="bottom">
            <template #activator="{ props: tooltipProps }">
              <AppButton
                v-bind="tooltipProps"
                icon
                variant="text"
                size="small"
                :loading="busyOrgId === org.organization_id && busyAction === 'mine'"
                :aria-label="t('user.hcp.detail.clinics.primaryMineSet')"
                @click="onSetPrimary(org.organization_id, 'mine')"
              >
                <AppIcon :name="org.organization_id === myPrimaryOrganizationId ? 'star' : 'star-outline'" />
              </AppButton>
            </template>
            <span>{{ t("user.hcp.detail.clinics.primaryMine") }}</span>
          </VTooltip>
          <AppButton
            v-if="canManage"
            icon
            variant="text"
            size="small"
            :aria-label="t('app.common.remove')"
            @click="askRemove(org.organization_id)"
          >
            <AppIcon name="trash" />
          </AppButton>
        </div>
      </li>
    </ul>

    <AppConfirmDialog
      v-model="showRemoveConfirm"
      :title="t('user.hcp.detail.clinics.removeConfirmTitle')"
      :text="t('user.hcp.detail.clinics.removeConfirmText')"
      :secondary-label="t('app.common.remove')"
      :primary-label="t('app.common.cancel')"
      :loading="removeLoading"
      @secondary="onConfirmRemove"
      @primary="showRemoveConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { reportCaught } from "@api";
/**
 * Practitioner clinic affiliations — the col6x2 "clinic" side of
 * HCPDetailView's Details tab (NEO-17). "Primary" is dual-scoped, not one
 * field — see commands/practitionerOrganization.ts's file doc comment and
 * docs/stories/pwa-medico-view.md:
 *   - the global star (visible to everyone, editable by admin/manager only)
 *     is practitioner_organization.is_primary
 *   - the "mine" star (visible/editable by rep only) is this rep's own
 *     practitioner_assignment.primary_org_id
 */
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppButton from "../AppButton.vue";
import AppIcon from "../AppIcon.vue";
import AppAvatar from "../AppAvatar.vue";
import EntityLink from "../EntityLink.vue";
import { hcoDetailLink } from "../../utils/entityLinks";
import AppEmptyState from "../AppEmptyState.vue";
import AppConfirmDialog from "../AppConfirmDialog.vue";
import { apiFetch } from "../../composables/useApi";
import { retryAction, useNotifications, type ShowOptions } from "../../composables/useNotifications";
import { useAsyncAction } from "../../composables/useAsyncAction";
import { useAuthStore } from "../../stores/auth";
import { useIdentity } from "../../composables/useIdentity";
import type { OrganizationAffiliation } from "../../types/practitionerOrganization";

const props = defineProps<{
  practitionerId: string;
  organizations: OrganizationAffiliation[];
  myPrimaryOrganizationId: string | null;
}>();

const emit = defineEmits<{
  changed: [];
}>();

const { t } = useI18n();
const { orgDetails } = useIdentity();
const notifications = useNotifications();
const authStore = useAuthStore();

const isAdminOrManager = computed(() => authStore.user?.role === "admin" || authStore.user?.role === "manager");
const isRep = computed(() => authStore.user?.role === "rep");
const canManage = computed(() => isAdminOrManager.value || isRep.value);

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

const orgOptions = ref<{ id: string; name: string }[]>([]);
const loadingOrgOptions = ref(false);
const selectedOrgId = ref<string | null>(null);

/** Toast options for a clinic: its icon plus its name as the record line. */
function clinicToast(organizationId: string): ShowOptions {
  const name =
    props.organizations.find((a) => a.organization_id === organizationId)?.name ??
    orgOptions.value.find((o) => o.id === organizationId)?.name;
  return { icon: "nav-hco", context: name };
}

const availableOrgOptions = computed(() =>
  orgOptions.value.filter((o) => !props.organizations.some((a) => a.organization_id === o.id))
);

async function loadOrgOptions(): Promise<void> {
  loadingOrgOptions.value = true;
  try {
    const res = await apiFetch("/api/v1/organization?limit=-1", { handleErrors: false });
    if (res.ok) {
      const json = (await res.json()) as { items?: { id: string; name: string }[] };
      orgOptions.value = json.items ?? [];
    }
  } finally {
    loadingOrgOptions.value = false;
  }
}

const { loading: addLoading, run: onAdd } = useAsyncAction(async () => {
  const organizationId = selectedOrgId.value;
  if (!organizationId) return;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${props.practitionerId}/organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id: organizationId }),
      handleErrors: false,
    });
    if (res.ok) {
      selectedOrgId.value = null;
      notifications.show(t("user.hcp.detail.clinics.addSuccess"), "success", undefined, clinicToast(organizationId));
      emit("changed");
      return;
    }
  } catch (err) {
    reportCaught(err, { where: "PractitionerClinicsPanel.onAdd" });
    // fall through to the error toast below
  }
  // The picker keeps the clinic selected — its Add button is the retry.
  notifications.show(t("user.hcp.detail.clinics.addError"), "error", undefined, clinicToast(organizationId));
});

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

const showRemoveConfirm = ref(false);
const pendingRemoveOrgId = ref<string | null>(null);

function askRemove(organizationId: string): void {
  pendingRemoveOrgId.value = organizationId;
  showRemoveConfirm.value = true;
}

const { loading: removeLoading, run: onConfirmRemove } = useAsyncAction(async () => {
  const organizationId = pendingRemoveOrgId.value;
  if (!organizationId) return;
  try {
    const res = await apiFetch(`/api/v1/practitioner/${props.practitionerId}/organizations/${organizationId}`, {
      method: "DELETE",
      handleErrors: false,
    });
    if (res.ok) {
      showRemoveConfirm.value = false;
      pendingRemoveOrgId.value = null;
      notifications.show(t("user.hcp.detail.clinics.removeSuccess"), "success", undefined, clinicToast(organizationId));
      emit("changed");
      return;
    }
  } catch (err) {
    reportCaught(err, { where: "PractitionerClinicsPanel.onConfirmRemove" });
    // fall through to the error toast below
  }
  // The confirm dialog stays open on failure — its button is the retry.
  notifications.show(t("user.hcp.detail.clinics.removeError"), "error", undefined, clinicToast(organizationId));
});

// ---------------------------------------------------------------------------
// Set primary (dual-scoped — see file doc comment)
// ---------------------------------------------------------------------------

const busyOrgId = ref<string | null>(null);
const busyAction = ref<"default" | "mine" | null>(null);

async function onSetPrimary(organizationId: string, scope: "default" | "mine"): Promise<void> {
  if (scope === "default" && !isAdminOrManager.value) return;
  if (scope === "mine" && !isRep.value) return;
  if (busyOrgId.value) return;

  busyOrgId.value = organizationId;
  busyAction.value = scope;
  const failSetPrimary = (): void =>
    notifications.show(t("user.hcp.detail.clinics.setPrimaryError"), "error", undefined, {
      ...clinicToast(organizationId),
      action: retryAction(() => onSetPrimary(organizationId, scope)),
    });
  try {
    const res = await apiFetch(`/api/v1/practitioner/${props.practitionerId}/organizations/${organizationId}/primary`, {
      method: "PATCH",
      handleErrors: false,
    });
    if (res.ok) {
      notifications.show(t("user.hcp.detail.clinics.setPrimarySuccess"), "success", undefined, clinicToast(organizationId));
      emit("changed");
    } else {
      failSetPrimary();
    }
  } catch (err) {
    reportCaught(err, { where: "PractitionerClinicsPanel.onSetPrimary" });
    failSetPrimary();
  } finally {
    busyOrgId.value = null;
    busyAction.value = null;
  }
}

onMounted(() => {
  if (canManage.value) loadOrgOptions();
});
</script>

<style scoped>
.practitioner-clinics-panel__add {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 20px;
}

.practitioner-clinics-panel__add-field {
  flex: 1;
}

.practitioner-clinics-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.practitioner-clinics-panel__item {
  padding: 12px 16px;
  border-radius: var(--pwa-radius);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.practitioner-clinics-panel__item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.practitioner-clinics-panel__name {
  font-weight: 600;
}

.practitioner-clinics-panel__address {
  display: block;
  margin-top: 2px;
  font-size: 0.8125rem;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.practitioner-clinics-panel__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}
</style>
