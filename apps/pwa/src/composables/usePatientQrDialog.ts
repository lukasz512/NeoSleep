import { reactive, type InjectionKey } from "vue";

/**
 * The patient QR dialog's state (NEO-235). PatientDetailView owns one and
 * opens it as a loader the moment the QR is asked for (patients list
 * "Next step", side panel); the Documentos tab's PatientChecklistPanel fills
 * it with the link once created. One dialog from tap to code, so the page
 * load, tab switch and link creation all happen underneath it.
 */
export interface QrDialogState {
  open: boolean;
  /** What the link covers — empty while the link is being created. */
  title: string;
  /** Null while loading. */
  url: string | null;
  requestId: string | null;
}

export const PATIENT_QR_DIALOG: InjectionKey<QrDialogState> = Symbol("patientQrDialog");

export function createQrDialogState(): QrDialogState {
  return reactive({ open: false, title: "", url: null, requestId: null });
}

/** Opens the dialog in its loading state (no link yet). */
export function openQrLoader(state: QrDialogState): void {
  Object.assign(state, { open: true, title: "", url: null, requestId: null });
}
