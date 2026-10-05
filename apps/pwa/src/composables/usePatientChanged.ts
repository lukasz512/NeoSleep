import { onBeforeUnmount, onMounted } from "vue";

/**
 * Something on an open patient card was saved (a visit booked, the record
 * edited), so every part of the card that shows it reloads without F5. Same
 * window-event pattern as CHECKLIST_UPDATED (NEO-173), which still covers
 * studies and documents.
 */
export const PATIENT_CHANGED = "patient-changed";
export type PatientChangeScope = "visits" | "profile";
export interface PatientChanged {
  patientId: string;
  scope: PatientChangeScope;
}

export function emitPatientChanged(patientId: string, scope: PatientChangeScope): void {
  window.dispatchEvent(new CustomEvent<PatientChanged>(PATIENT_CHANGED, { detail: { patientId, scope } }));
}

/** Runs `handler` when this patient changed anywhere on screen. */
export function onPatientChanged(patientId: () => string, handler: (scope: PatientChangeScope) => void): void {
  const listener = (event: Event) => {
    const { detail } = event as CustomEvent<PatientChanged>;
    if (detail.patientId === patientId()) handler(detail.scope);
  };
  onMounted(() => window.addEventListener(PATIENT_CHANGED, listener));
  onBeforeUnmount(() => window.removeEventListener(PATIENT_CHANGED, listener));
}
