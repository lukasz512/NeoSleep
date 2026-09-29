import { ref, computed, watch, nextTick, type ComponentPublicInstance } from "vue";
import { useI18n } from "vue-i18n";
import { apiFetch } from "./useApi";
import { useNotifications } from "./useNotifications";
import { useFormErrors, focusFormField, type FieldErrors, type FormErrorField } from "./useFormErrors";
import { scrollToFormTop } from "../utils/scrollToFormTop";
import type { EventFormData, EventFormInitialData, EventSubmitPayload } from "../components/EventForm.types";

/** Map UI status → API status. */
export const UI_TO_API_STATUS: Record<string, "scheduled" | "completed" | "cancelled" | "no_show"> = {
  planned: "scheduled",
  done: "completed",
  rejected: "cancelled",
  no_show: "no_show",
};

/** API payload key → the form field that edits it, so a 400 naming the key marks that field (NEO-109). */
export const EVENT_API_TO_FORM_KEY: Record<string, keyof EventFormData> = {
  title: "title",
  start_at: "start",
  end_at: "end",
  type: "type",
  status: "status",
  location: "location",
  video_link: "videoLink",
  notes: "notes",
  region: "region",
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
  const notifications = useNotifications();

  const formRef = ref<{ validate: () => Promise<{ valid: boolean }>; $el?: Element } | null>(null);
  const submitting = ref(false);
  const showDiscardConfirm = ref(false);
  const initialFormSnapshot = ref<EventFormData | null>(null);
  const hcoOptions = ref<{ id: string; name: string }[]>([]);
  const hcpOptions = ref<{ id: string; name: string }[]>([]);
  const patientOptions = ref<{ id: string; name: string }[]>([]);
  const loadingHco = ref(false);
  const loadingHcp = ref(false);
  const loadingPatient = ref(false);

  const form = ref<EventFormData>({
    title: "", start: "", end: "", type: "f2f", status: "planned",
    hcoIds: [], hcpIds: [], patientIds: [], location: "", videoLink: "", notes: "", region: "",
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

  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const startRules = computed(() => [
    (v: unknown) => !!text(v) || t("user.planner.form.validation.startRequired"),
  ]);
  const endRules = computed(() => [
    (v: unknown) => !!text(v) || t("user.planner.form.validation.endRequired"),
    (v: unknown) => {
      const start = form.value.start?.trim();
      const end = text(v);
      if (!start || !end) return true;
      return new Date(end) > new Date(start) || t("user.planner.form.validation.endAfterStart");
    },
  ]);

  /**
   * Errors show in the form, never as a toast (NEO-109) — same pattern as
   * FormRenderer: under the field, in the summary box on top, only after the
   * first Save; a field the API rejected clears as soon as it's edited.
   */
  const { attempted, serverError, clearServerError, setServerErrors, reset: resetErrors, errorListFor } = useFormErrors();

  const errorFields = computed<FormErrorField[]>(() => {
    const f = form.value;
    const fields: FormErrorField[] = [
      { key: "title", label: t("user.planner.form.fieldTitle"), value: f.title },
      { key: "start", label: t("user.planner.form.fieldStart"), value: f.start, rules: startRules.value },
      { key: "end", label: t("user.planner.form.fieldEnd"), value: f.end, rules: endRules.value },
      { key: "type", label: t("user.planner.form.fieldType"), value: f.type },
      { key: "status", label: t("user.planner.form.fieldStatus"), value: f.status },
    ];
    if (f.type === "f2f") fields.push({ key: "location", label: t("user.planner.form.fieldLocation"), value: f.location });
    if (f.type === "video") fields.push({ key: "videoLink", label: t("user.planner.form.fieldVideoLink"), value: f.videoLink });
    fields.push(
      { key: "notes", label: t("user.planner.form.fieldNotes"), value: f.notes },
      { key: "region", label: t("user.planner.form.fieldRegion"), value: f.region },
    );
    return fields;
  });
  const errorList = errorListFor(() => errorFields.value);

  // Editing a field the API rejected clears its error right away.
  for (const key of Object.values(EVENT_API_TO_FORM_KEY)) {
    watch(() => form.value[key], () => clearServerError(key));
  }

  const fieldEls: Record<string, Element> = {};
  function setFieldEl(key: string, el: Element | ComponentPublicInstance | null) {
    if (!el) delete fieldEls[key];
    else fieldEls[key] = el instanceof Element ? el : el.$el;
  }
  /** The summary's links jump to their field. */
  function focusField(key: string) {
    focusFormField(fieldEls[key]);
  }

  /**
   * Marks the fields the API rejected (its payload keys mapped to this form's
   * keys) and scrolls up to the summary. A field this form doesn't show can't
   * be marked, so that one still gets a toast.
   */
  function showServerErrors(fieldErrors: FieldErrors) {
    const mapped: FieldErrors = {};
    for (const [apiKey, reason] of Object.entries(fieldErrors)) {
      const key = EVENT_API_TO_FORM_KEY[apiKey];
      if (key) mapped[key] = reason;
    }
    if (setServerErrors(mapped, errorFields.value.map((f) => f.key))) {
      nextTick(() => scrollToFormTop(formRef.value?.$el));
    } else {
      notifications.show(t("app.formRenderer.validation.saveRejected"), "error", undefined, { icon: "sad-cloud" });
    }
  }

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

  async function loadPatient() {
    loadingPatient.value = true;
    try {
      const res = await apiFetch("/api/v1/patient?limit=-1", { handleErrors: false });
      if (res.ok) {
        const json = (await res.json()) as { items?: { id: string; name: string }[] };
        patientOptions.value = json.items ?? [];
      }
    } finally {
      loadingPatient.value = false;
    }
  }

  function getAttendeesByType(attendees?: { attendee_type: string; attendee_id: string }[]) {
    const hcoIds: string[] = [];
    const hcpIds: string[] = [];
    const patientIds: string[] = [];
    for (const a of attendees ?? []) {
      if (a.attendee_type === "hco") hcoIds.push(a.attendee_id);
      if (a.attendee_type === "doctor") hcpIds.push(a.attendee_id);
      if (a.attendee_type === "patient") patientIds.push(a.attendee_id);
    }
    return { hcoIds, hcpIds, patientIds };
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
      JSON.stringify([...f.patientIds].sort()) !== JSON.stringify([...snap.patientIds].sort()) ||
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
    attempted.value = true;
    const valid = await formRef.value?.validate();
    if (!valid?.valid || errorList.value.length) {
      scrollToFormTop(formRef.value?.$el);
      return;
    }
    submitting.value = true;
    try {
      const attendees: EventSubmitPayload["attendees"] = [];
      for (const id of form.value.hcoIds)
        attendees.push({ attendee_type: "hco", attendee_id: id, is_primary: false });
      for (const id of form.value.hcpIds)
        attendees.push({ attendee_type: "doctor", attendee_id: id, is_primary: false });
      for (const id of form.value.patientIds)
        attendees.push({ attendee_type: "patient", attendee_id: id, is_primary: false });
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
      const result = await new Promise<{ ok: boolean; fieldErrors?: FieldErrors }>((resolve) =>
        emit("submit", payload, (ok: boolean, fieldErrors?: FieldErrors) => resolve({ ok, fieldErrors })),
      );
      if (result.ok) emit("update:modelValue", false);
      else if (result.fieldErrors) showServerErrors(result.fieldErrors);
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
        loadPatient();
        if (initial && (initial.id || initial.start || initial.end || initial.start_at || initial.end_at)) {
          const startIso = initial.start ?? initial.start_at ?? "";
          const endIso   = initial.end   ?? initial.end_at   ?? "";
          const { hcoIds, hcpIds, patientIds } = initial.hcoIds || initial.hcpIds || initial.patientIds
            ? { hcoIds: initial.hcoIds ?? [], hcpIds: initial.hcpIds ?? [], patientIds: initial.patientIds ?? [] }
            : getAttendeesByType(initial.attendees);
          form.value = {
            title:     (initial.title ?? "").trim(),
            start:     toDatetimeLocal(startIso),
            end:       toDatetimeLocal(endIso),
            type:      initial.type === "video" ? "video" : "f2f",
            status:    initial.status ? (API_TO_UI_STATUS[initial.status] ?? initial.status) : "planned",
            hcoIds:    [...hcoIds],
            hcpIds:    [...hcpIds],
            patientIds: [...patientIds],
            location:  (initial.location ?? "").trim(),
            videoLink: (initial.videoLink ?? initial.video_link ?? "").trim(),
            notes:     (initial.notes ?? "").trim(),
            region:    (initial.region ?? "").trim(),
          };
        } else {
          form.value = {
            title: "", start: "", end: "", type: "f2f", status: "planned",
            hcoIds: [], hcpIds: [], patientIds: [], location: "", videoLink: "", notes: "", region: "",
          };
        }
        initialFormSnapshot.value = { ...form.value };
        resetErrors();
      } else {
        initialFormSnapshot.value = null;
      }
    },
  );

  return {
    formRef, form, submitting, showDiscardConfirm,
    hcoOptions, hcpOptions, patientOptions, loadingHco, loadingHcp, loadingPatient,
    typeItems, statusItems,
    isEditMode, formTitle, formSubmitLabel,
    startRules, endRules,
    errorList, serverError, setFieldEl, focusField,
    onDialogUpdate, confirmDiscard, onCancelClick, onSubmit,
  };
}
