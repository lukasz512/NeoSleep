import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOTIFICATION_CATALOG, NOTIFICATION_TYPES, copyKeys, GROUPED_BODY_KEY } from "./catalog.js";

const I18N_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/i18n");
const LOCALES = ["en", "pl", "mx"] as const;
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${l}.json`), "utf-8")) as Record<string, string>])
);

const ALLOWED_PLACEHOLDERS = new Set(["count"]);

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
}

describe("notification catalog", () => {
  it("has title and body copy for every type in en, pl and mx", () => {
    for (const type of NOTIFICATION_TYPES) {
      const keys = copyKeys(type);
      for (const locale of LOCALES) {
        expect(messages[locale]![keys.title], `${locale} ${keys.title}`).toBeTruthy();
        expect(messages[locale]![keys.body], `${locale} ${keys.body}`).toBeTruthy();
      }
    }
    for (const locale of LOCALES) expect(messages[locale]![GROUPED_BODY_KEY]).toContain("{count}");
  });

  // PHI guard (ADR-012, ADR-027 §6): push/email/SMS copy is read on lock screens
  // and in inboxes. A template that can't take a variable can't leak a patient's
  // name — so the only placeholder allowed anywhere is {count}.
  it("copy never takes a variable other than {count}", () => {
    const keys = [...NOTIFICATION_TYPES.flatMap((t) => Object.values(copyKeys(t))), GROUPED_BODY_KEY];
    for (const key of keys) {
      for (const locale of LOCALES) {
        const bad = placeholders(messages[locale]![key] ?? "").filter((p) => !ALLOWED_PLACEHOLDERS.has(p));
        expect(bad, `${locale} ${key}`).toEqual([]);
      }
    }
  });

  it("builds deep links from ids only", () => {
    expect(NOTIFICATION_CATALOG.appointment_booked.link({})).toBe("/calendar");
    expect(NOTIFICATION_CATALOG.partner_order_status_changed.link({ patientId: "p-1" })).toBe("/patients/p-1");
    expect(NOTIFICATION_CATALOG.partner_order_status_changed.link({})).toBeNull();
  });

  it("never marks a type high priority from clinical data — every v1 type is normal", () => {
    for (const type of NOTIFICATION_TYPES) expect(NOTIFICATION_CATALOG[type].priority).toBe("normal");
  });
});
