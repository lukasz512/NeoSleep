import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "../utils/api";
import type { EventFormData, EventFormInitialData, EventSubmitPayload } from "../components/EventForm.types";

/** Map UI status → API status. */
export const UI_TO_API_STATUS: Record<string, "scheduled" | "completed" | "cancelled" | "no_show"> = {
  planned: "scheduled",
  done: "completed",
  rejected: "cancelled",
  no_show: "no_show",
};

/** Map API status → UI status. */
export const API_TO_UI_STATUS: Record<string, string> = {
  scheduled: "planned",
  completed: "done",
  cancelled: "rejected",
  no_show: "no_show",
};

export function useEventForm(
  props: { modelValue: boolean; initialData?: EventFormInitialData },
  emit: (event: "update:modelValue" | "submit", ...args: unknown[]) => void,
) {
  const { t } = useI18n();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<EventFormData | null>(null);
  const hcoOptions = ref<{ id: string; name: string }[]>([]);
  const hcpOptions = ref<{ id: string; name: string }[]>([]);
  const loadingHco = ref(false);
  const loadingHcp = ref(false);

  const form = ref<EventFormData>({
    title: "", start: "", end: "", type: "f2f", status: "planned",
    hcoIds: [], hcpIds: [], location: "", videoLink: "", notes: "", region: "",
  });

  const typeItems = computed(() => [
    { title: t("user.planner.form.typeF2f"),   value: "f2f"   },
    { title: t("user.planner.form.typeVideo"),  value: "video" },
  ]);

  const statusItems = computed(() => [
    { title: t("user.planner.form.statusPlanned"),  value: "planned"  },
    { title: t("user.planner.form.statusDone"),     value: "done"     },
    { title: t("user.planner.form.statusRejected"), value: "rejected" },
    { title: t("user.planner.form.statusNoShow"),   value: "no_show"  },
  ]);

  const isEditMode  = computed(() => !!props.initialData?.id);
  const formTitle   = computed(() => isEditMode.value ? t("user.planner.form.editTitle") : t("user.planner.form.title"));
  const formSubmitLabel = computed(() => isEditMode.value ? t("user.planner.form.editSubmit") : t("user.planner.form.submit"));

  const startRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.planner.form.validation.startRequired"),
  ]);
  const endRules = computed(() => [
    (v: string) => !!v?.trim() || t("user.planner.form.validation.endRequired"),
    (v: string) => {
      const start = form.value.start?.trim();
      const end = v?.trim();
      if (!start || !end) return true;
      return new Date(end) > new Date(start) || t("user.planner.form.validation.endAfterStart");
    },
  ]);

  function toDatetimeLocal(iso: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fromDatetimeLocal(local: string): string {
    if (!local?.trim()) return "";
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }

  async function loadHco() {
    loadingHco.value = true;
    try {
      const res = await apiFetch("/api/v1/organization?limit=-1", { handleErrors: false });
      if (res.ok) {
        const json = (await res.json()) as { items?: { id: string; name: string }[] };
        hcoOptions.value = json.items ?? [];
      }
    } finally {
      loadingHco.value = false;
    }
  }

  async function loadHcp() {
    loadingHcp.value = true;
    try {
      const res = await apiFetch("/api/v1/practitioner?limit=-1", { handleErrors: false });
      if (res.ok) {
        const json = (await res.json()) as { items?: { id: string; name: string }[] };
        hcpOptions.value = json.items ?? [];
      }
    } finally {
      loadingHcp.value = false;
    }
  }

  function getHcoHcpFromAttendees(attendees?: { attendee_type: string; attendee_id: string }[]) {
    const hcoIds: string[] = [];
    const hcpIds: string[] = [];
    for (const a of attendees ?? []) {
      if (a.attendee_type === "hco") hcoIds.push(a.attendee_id);
      if (a.attendee_type === "hcp") hcpIds.push(a.attendee_id);
    }
    return { hcoIds, hcpIds };
  }

  function hasFormChanged(): boolean {
    const snap = initialFormSnapshot.value;
    if (!snap) return false;
    const f = form.value;
    const eq = (a: string, b: string) => (a ?? "").trim() === (b ?? "").trim();
    return (
      !eq(f.title, snap.title) || !eq(f.start, snap.start) || !eq(f.end, snap.end) ||
      f.type !== snap.type || f.status !== snap.status ||
      JSON.stringify([...f.hcoIds].sort()) !== JSON.stringify([...snap.hcoIds].sort()) ||
      JSON.stringify([...f.hcpIds].sort()) !== JSON.stringify([...snap.hcpIds].sort()) ||
      !eq(f.location, snap.location) || !eq(f.videoLink, snap.videoLink) ||
      !eq(f.notes, snap.notes) || !eq(f.region, snap.region)
    );
  }

  function onDialogUpdate(value: boolean) {
    if (value === false && hasFormChanged()) {
      showDiscardConfirm.value = true;
    } else {
      emit("update:modelValue", value);
    }
  }

  function confirmDiscard() {
    showDiscardConfirm.value = false;
    emit("update:modelValue", false);
  }

  function onCancelClick() {
    if (hasFormChanged()) {
      showDiscardConfirm.value = true;
    } else {
      emit("update:modelValue", false);
    }
  }

  async function onSubmit() {
    const valid = await formRef.value?.validate();
    if (!valid?.valid) return;
    submitting.value = true;
    try {
      const attendees: EventSubmitPayload["attendees"] = [];
      for (const id of form.value.hcoIds)
        attendees.push({ attendee_type: "hco", attendee_id: id, is_primary: false });
      for (const id of form.value.hcpIds)
        attendees.push({ attendee_type: "hcp", attendee_id: id, is_primary: false });
      const payload: EventSubmitPayload = {
        id: props.initialData?.id,
        title: form.value.title.trim(),
        start_at: fromDatetimeLocal(form.value.start),
        end_at: fromDatetimeLocal(form.value.end),
        type: form.value.type,
        status: UI_TO_API_STATUS[form.value.status] ?? "scheduled",
        location: form.value.location.trim() || null,
        video_link: form.value.videoLink.trim() || null,
        notes: form.value.notes.trim() || null,
        region: form.value.region.trim(),
        attendees,
      };
      emit("submit", payload);
      emit("update:modelValue", false);
    } finally {
      submitting.value = false;
    }
  }

  watch(
    () => [props.modelValue, props.initialData] as const,
    ([open, initial]) => {
      if (open) {
        loadHco();
        loadHcp();
        if (initial && (initial.id || initial.start || initial.end || initial.start_at || initial.end_at)) {
          const startIso = initial.start ?? initial.start_at ?? "";
          const endIso   = initial.end   ?? initial.end_at   ?? "";
          const { hcoIds, hcpIds } = initial.hcoIds || initial.hcpIds
            ? { hcoIds: initial.hcoIds ?? [], hcpIds: initial.hcpIds ?? [] }
            : getHcoHcpFromAttendees(initial.attendees);
          form.value = {
            title:     (initial.title ?? "").trim(),
            start:     toDatetimeLocal(startIso),
            end:       toDatetimeLocal(endIso),
            type:      initial.type === "video" ? "video" : "f2f",
            status:    initial.status ? (API_TO_UI_STATUS[initial.status] ?? initial.status) : "planned",
            hcoIds:    [...hcoIds],
            hcpIds:    [...hcpIds],
            location:  (initial.location ?? "").trim(),
            videoLink: (initial.videoLink ?? initial.video_link ?? "").trim(),
            notes:     (initial.notes ?? "").trim(),
            region:    (initial.region ?? "").trim(),
          };
        } else {
          form.value = {
            title: "", start: "", end: "", type: "f2f", status: "planned",
            hcoIds: [], hcpIds: [], location: "", videoLink: "", notes: "", region: "",
          };
        }
        initialFormSnapshot.value = { ...form.value };
      } else {
        initialFormSnapshot.value = null;
      }
    },
  );

  return {
    formRef, form, submitting, showDiscardConfirm,
    hcoOptions, hcpOptions, loadingHco, loadingHcp,
    typeItems, statusItems,
    isEditMode, formTitle, formSubmitLabel,
    startRules, endRules,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
