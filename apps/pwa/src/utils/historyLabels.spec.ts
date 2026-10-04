import { describe, it, expect } from "vitest";
import {
  historyActionIcon,
  historyActionColor,
  historyEntityTypeLabel,
  historyFieldChanges,
  historyValueLabel,
  historyHeadline,
  historyHeadlineCoversChanges,
  isClinicalHistoryEntry,
  groupHistoryByDay,
  historyDayLabel,
} from "./historyLabels";
import en from "@i18n/en.json";
import pl from "@i18n/pl.json";
import mx from "@i18n/mx.json";

describe("historyActionIcon", () => {
  it("maps each known action to its distinct icon", () => {
    expect(historyActionIcon("create")).toBe("plus-circle");
    expect(historyActionIcon("update")).toBe("pencil");
    expect(historyActionIcon("delete")).toBe("trash");
    expect(historyActionIcon("restore")).toBe("refresh");
    expect(historyActionIcon("read")).toBe("eye");
    expect(historyActionIcon("notify")).toBe("mail");
  });

  it("falls back to a generic icon for an unknown action", () => {
    expect(historyActionIcon("something_new")).toBe("info-circle");
  });
});

describe("historyActionColor", () => {
  it("maps each known action to a distinct Vuetify color", () => {
    expect(historyActionColor("create")).toBe("success");
    expect(historyActionColor("update")).toBe("info");
    expect(historyActionColor("delete")).toBe("error");
    expect(historyActionColor("restore")).toBe("warning");
  });

  it("falls back to a real themed color (never the unthemed default) for read and any unknown action", () => {
    expect(historyActionColor("read")).toBe("secondary");
    expect(historyActionColor("something_new")).toBe("secondary");
  });
});

describe("historyEntityTypeLabel", () => {
  const t = (key: string) =>
    ({
      "app.history.entityType.Patient": "Patient",
      "app.history.entityType.SleepStudy": "Sleep Study",
    })[key] ?? key;

  it("humanizes a known entity_type via i18n", () => {
    expect(historyEntityTypeLabel(t, "Patient")).toBe("Patient");
    expect(historyEntityTypeLabel(t, "SleepStudy")).toBe("Sleep Study");
  });

  it("falls back to the raw entity_type when no translation exists", () => {
    expect(historyEntityTypeLabel(t, "SomeFutureEntity")).toBe("SomeFutureEntity");
  });
});

describe("app.history.entityType i18n parity", () => {
  const messages: Record<string, Record<string, unknown>> = { en, pl, mx };
  const entityTypes = ["Patient", "Practitioner", "Organization", "SleepStudy", "TreatmentPlan"];

  it("has a non-empty label for every known entity_type in every supported locale", () => {
    for (const [locale, dict] of Object.entries(messages)) {
      for (const entityType of entityTypes) {
        const key = `app.history.entityType.${entityType}`;
        expect(dict[key], `missing ${locale}: ${key}`).toBeDefined();
        expect(typeof dict[key]).toBe("string");
        expect((dict[key] as string).length).toBeGreaterThan(0);
      }
    }
  });
});

// Real English copy with {param} interpolation — same contract as vue-i18n's t().
const tEn = (key: string, params?: unknown): string => {
  const raw = (en as Record<string, string>)[key];
  if (raw === undefined) return key;
  const p = (params ?? {}) as Record<string, unknown>;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(p[name] ?? `{${name}}`));
};

describe("historyFieldChanges", () => {
  it("lists only fields whose value actually changed on an update", () => {
    const changes = historyFieldChanges({
      action: "update",
      entity_type: "Organization",
      entity_before: { id: "o1", name: "Clinic A", status: "active", region: "PL" },
      entity_after: { id: "o1", name: "Clinic B", status: "active", region: "PL" },
    });
    expect(changes).toEqual([{ field: "name", before: "Clinic A", after: "Clinic B" }]);
  });

  it("never surfaces record identifiers as changes", () => {
    const changes = historyFieldChanges({
      action: "create",
      entity_type: "SleepStudy",
      entity_before: null,
      entity_after: { patient_id: "p1", status: "ordered" },
    });
    expect(changes.map((c) => c.field)).toEqual(["status"]);
  });

  it("records the last known values on a delete", () => {
    const changes = historyFieldChanges({
      action: "delete",
      entity_type: "TreatmentPlan",
      entity_before: { type: "cpap", status: "in_progress" },
      entity_after: null,
    });
    expect(changes).toEqual([
      { field: "type", before: "cpap", after: null },
      { field: "status", before: "in_progress", after: null },
    ]);
  });
});

describe("historyValueLabel", () => {
  it("renders stored status and type codes in the reader's language, per entity type", () => {
    expect(historyValueLabel(tEn, "SleepStudy", "status", "device_shipped")).toBe("Device shipped");
    expect(historyValueLabel(tEn, "TreatmentPlan", "status", "on_hold")).toBe("On hold");
    expect(historyValueLabel(tEn, "Patient", "status", "follow_up")).toBe(en["app.patients.filters.statusFollowUp"]);
    expect(historyValueLabel(tEn, "Practitioner", "status", "pending_approval")).toBe("Pending approval");
    expect(historyValueLabel(tEn, "Organization", "type", "hospital")).toBe(en["user.hco.filters.typeHospital"]);
    expect(historyValueLabel(tEn, "TreatmentPlan", "type", "dental_appliance")).toBe("Dental appliance");
  });

  it("resolves specialty codes through the tenant lookup, falling back to the code", () => {
    const lookups = { specialty: (code: string) => (code === "ent" ? "ENT" : undefined) };
    expect(historyValueLabel(tEn, "Practitioner", "primary_specialty", "ent", lookups)).toBe("ENT");
    expect(historyValueLabel(tEn, "Practitioner", "primary_specialty", "custom_code", lookups)).toBe("custom_code");
  });

  it("resolves region codes through the tenant region lookup, falling back to the code", () => {
    const lookups = { region: (code: string) => (code === "PL-MZ" ? "Mazowieckie" : undefined) };
    expect(historyValueLabel(tEn, "Patient", "region", "PL-MZ", lookups)).toBe("Mazowieckie");
    expect(historyValueLabel(tEn, "Patient", "region", "XX-UNKNOWN", lookups)).toBe("XX-UNKNOWN");
  });

  it("says 'Not set' for empty values instead of a bare dash", () => {
    expect(historyValueLabel(tEn, "Organization", "region", null)).toBe("Not set");
    expect(historyValueLabel(tEn, "Organization", "region", "")).toBe("Not set");
  });

  it("shows appointment times as a date in the clinic's zone, statuses and email kinds in words (CORE-133)", () => {
    const lookups = { dateTime: (iso: string, zone?: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) };
    expect(historyValueLabel(tEn, "Appointment", "start_at", "2031-01-02T21:00:00.000Z", lookups, "America/Mexico_City")).toBe("02/01/2031, 15:00");
    expect(historyValueLabel(tEn, "Appointment", "status", "no_show")).toBe("No-show");
    // CORE-137: an event reads like the planner form, never as a raw FHIR code.
    expect(historyValueLabel(tEn, "Encounter", "status", "scheduled")).toBe("Scheduled");
    expect(historyValueLabel(tEn, "Encounter", "type", "visit")).toBe("Face-to-face");
    expect(historyValueLabel(tEn, "Encounter", "type", "call")).toBe("Video call");
    expect(historyValueLabel(tEn, "Encounter", "type", "congress")).toBe("congress");
    expect(historyValueLabel(tEn, "Appointment", "kind", "booked")).toBe("booking confirmation");
  });

  it("never lists the stored zone as a change of its own", () => {
    expect(historyFieldChanges({ action: "create", entity_type: "Appointment", entity_before: null, entity_after: { status: "scheduled", timezone: "America/Mexico_City" } }).map((c) => c.field)).toEqual(["status"]);
  });

  it("shows unknown codes as-is (fail visible)", () => {
    expect(historyValueLabel(tEn, "SleepStudy", "status", "brand_new_status")).toBe("brand_new_status");
  });
});

describe("historyHeadline", () => {
  it("reads a single status change as one plain sentence naming the new status", () => {
    const headline = historyHeadline(tEn, {
      action: "update",
      entity_type: "SleepStudy",
      entity_before: { status: "ordered" },
      entity_after: { status: "device_shipped" },
    });
    expect(headline).toBe("Sleep study status changed to Device shipped");
  });

  it("uses a per-entity sentence for every other action", () => {
    expect(historyHeadline(tEn, { action: "create", entity_type: "Patient", entity_before: null, entity_after: { status: "active" } }))
      .toBe("Patient record created");
    expect(historyHeadline(tEn, { action: "read", entity_type: "Practitioner", entity_before: null, entity_after: null }))
      .toBe("Doctor profile viewed");
  });

  it("reads bookings, emails, encounters and questionnaire links as plain sentences (CORE-133)", () => {
    const h = (action: string, entity_type: string, entity_after: Record<string, unknown> | null = null, entity_before: Record<string, unknown> | null = null) =>
      historyHeadline(tEn, { action, entity_type, entity_before, entity_after });
    expect(h("create", "Appointment", { status: "scheduled" })).toBe("Appointment booked");
    expect(h("update", "Appointment", { start_at: "2031-01-02T10:00:00.000Z" }, { start_at: "2031-01-01T10:00:00.000Z" })).toBe("Appointment changed");
    expect(h("update", "Appointment", { status: "cancelled" }, { status: "scheduled" })).toBe("Appointment status changed to Cancelled");
    expect(h("delete", "Appointment")).toBe("Appointment deleted");
    expect(h("notify", "Appointment", { channel: "email", kind: "reminder" })).toBe("Email to the patient: reminder");
    expect(h("create", "Encounter")).toBe("Event created");
    expect(h("create", "QuestionnaireRequest")).toBe("Questionnaire link created");
  });

  it("every new headline exists in every language", () => {
    const keys = [
      "app.history.headline.Appointment.create", "app.history.headline.Appointment.update", "app.history.headline.Appointment.delete",
      "app.history.headline.Appointment.notify", "app.history.statusChanged.Appointment",
      "app.history.headline.Encounter.create", "app.history.headline.Encounter.update",
      "app.history.headline.QuestionnaireRequest.create", "app.history.headline.QuestionnaireRequest.update",
      "app.history.emailKind.booked", "app.history.emailKind.rescheduled", "app.history.emailKind.cancelled",
      "app.history.emailKind.ask", "app.history.emailKind.reminder", "app.history.emailKind.today",
      "app.history.field.start_at", "app.history.field.end_at", "app.history.field.kind", "app.history.field.channel", "app.history.field.expires_at",
    ];
    for (const [locale, dict] of Object.entries({ en, pl, mx } as Record<string, Record<string, unknown>>)) {
      for (const key of keys) expect(dict[key], `missing ${locale}: ${key}`).toEqual(expect.any(String));
    }
  });

  it("falls back to action + entity label for an unknown entity type", () => {
    expect(historyHeadline(tEn, { action: "update", entity_type: "Invoice", entity_before: null, entity_after: null }))
      .toBe("Updated Invoice");
  });

  it("flags when the headline already states the only change", () => {
    const statusOnly = { action: "update", entity_type: "SleepStudy", entity_before: { status: "a" }, entity_after: { status: "b" } };
    const twoFields = { action: "update", entity_type: "Organization", entity_before: { status: "a", name: "x" }, entity_after: { status: "b", name: "y" } };
    expect(historyHeadlineCoversChanges(statusOnly)).toBe(true);
    expect(historyHeadlineCoversChanges(twoFields)).toBe(false);
  });
});

describe("isClinicalHistoryEntry", () => {
  it("marks sleep studies and treatment plans as clinical, everything else as administrative", () => {
    expect(isClinicalHistoryEntry({ entity_type: "SleepStudy" })).toBe(true);
    expect(isClinicalHistoryEntry({ entity_type: "TreatmentPlan" })).toBe(true);
    expect(isClinicalHistoryEntry({ entity_type: "Patient" })).toBe(false);
    expect(isClinicalHistoryEntry({ entity_type: "Organization" })).toBe(false);
  });
});

describe("groupHistoryByDay / historyDayLabel", () => {
  it("groups entries by local calendar day, preserving newest-first order", () => {
    const groups = groupHistoryByDay([
      { id: "a", created_at: new Date(2026, 8, 24, 15, 0).toISOString() },
      { id: "b", created_at: new Date(2026, 8, 24, 9, 0).toISOString() },
      { id: "c", created_at: new Date(2026, 8, 20, 12, 0).toISOString() },
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-09-24", "2026-09-20"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("labels today and yesterday in words, older days with a full localized date", () => {
    const now = new Date(2026, 8, 24, 12, 0);
    expect(historyDayLabel(tEn, new Date(2026, 8, 24, 8, 0), now, "en")).toBe("Today");
    expect(historyDayLabel(tEn, new Date(2026, 8, 23, 23, 59), now, "en")).toBe("Yesterday");
    expect(historyDayLabel(tEn, new Date(2026, 8, 20, 12, 0), now, "en")).toBe("Sunday, September 20");
    expect(historyDayLabel(tEn, new Date(2025, 8, 20, 12, 0), now, "en")).toContain("2025");
  });
});

describe("history sentence i18n parity", () => {
  const messages: Record<string, Record<string, unknown>> = { en, pl, mx };
  const entityTypes = ["Patient", "Practitioner", "Organization", "SleepStudy", "TreatmentPlan"];
  const actions = ["create", "update", "delete", "restore", "read"];

  it("has a headline for every entity type × action and a status sentence per entity type, in every locale", () => {
    for (const [locale, dict] of Object.entries(messages)) {
      for (const entityType of entityTypes) {
        for (const action of actions) {
          expect(dict[`app.history.headline.${entityType}.${action}`], `missing ${locale} headline ${entityType}.${action}`).toBeTruthy();
        }
        const status = dict[`app.history.statusChanged.${entityType}`];
        expect(status, `missing ${locale} statusChanged.${entityType}`).toBeTruthy();
        expect(status as string).toContain("{status}");
      }
    }
  });
});
