import type { FormFieldDef, FormFieldOption } from "../../types/formField";

/**
 * Sleep study edit form (Badania tab). Interpretation fields are editable by
 * any staff role — no field-level gate, see apps/api/src/commands/sleepStudy.ts.
 * Fields not exposed here (supplier_id, purchase_order_id, oa_indicated,
 * cpap_indicated, raw_results, diagnosis_code) are set elsewhere in the
 * clinical pipeline (device fulfillment / partner webhook) — this form only
 * covers what a rep or doctor fills in by hand.
 */

const STATUS_OPTIONS: FormFieldOption[] = [
  { title: "app.sleepStudies.status.ordered", value: "ordered" },
  { title: "app.sleepStudies.status.deviceShipped", value: "device_shipped" },
  { title: "app.sleepStudies.status.deviceDelivered", value: "device_delivered" },
  { title: "app.sleepStudies.status.studyComplete", value: "study_complete" },
  { title: "app.sleepStudies.status.resultsReceived", value: "results_received" },
  { title: "app.sleepStudies.status.interpreted", value: "interpreted" },
  { title: "app.sleepStudies.status.cancelled", value: "cancelled" },
];

export const sleepStudyFormFields: FormFieldDef[] = [
  { key: "study_date", type: "date", labelKey: "app.sleepStudies.form.studyDate", cols: 6 },
  { key: "status", type: "select", labelKey: "app.sleepStudies.form.status", options: STATUS_OPTIONS, default: "ordered", cols: 6 },
  { key: "device_serial", type: "text", labelKey: "app.sleepStudies.form.deviceSerial", cols: 6 },
  { key: "ahi_score", type: "number", labelKey: "app.sleepStudies.form.ahiScore", cols: 6 },
  { key: "spo2_nadir", type: "number", labelKey: "app.sleepStudies.form.spo2Nadir", cols: 6 },
  { key: "odi", type: "number", labelKey: "app.sleepStudies.form.odi", cols: 6 },
  { key: "interpretation", type: "textarea", labelKey: "app.sleepStudies.form.interpretation", cols: 12 },
];
