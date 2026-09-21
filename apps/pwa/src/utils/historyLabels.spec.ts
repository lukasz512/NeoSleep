import { describe, it, expect } from "vitest";
import { historyActionIcon, historyActionColor, historyEntityTypeLabel } from "./historyLabels";
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
