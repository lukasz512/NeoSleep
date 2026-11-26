import { describe, it, expect } from "vitest";
import { quietWindowEnd, isChannelEnabled, resolveChannels, type RecipientPreferences } from "./preferences.js";
import { NOTIFICATION_CATALOG, type NotificationEventDefinition } from "./catalog.js";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../db/notificationPreference.js";

const at = (iso: string): Date => new Date(iso);

describe("quietWindowEnd", () => {
  it("defers inside a window that crosses midnight, to its end in the user's zone", () => {
    // 22:30 in Warsaw (UTC+2 in September) → window 21:00–07:00 ends 07:00 Warsaw = 05:00Z
    expect(quietWindowEnd(at("2026-09-28T20:30:00Z"), "Europe/Warsaw", "21:00", "07:00")?.toISOString()).toBe("2026-09-29T05:00:00.000Z");
    // 02:15 Warsaw, after midnight, same window
    expect(quietWindowEnd(at("2026-09-29T00:15:00Z"), "Europe/Warsaw", "21:00", "07:00")?.toISOString()).toBe("2026-09-29T05:00:00.000Z");
  });

  it("returns null outside the window", () => {
    expect(quietWindowEnd(at("2026-09-28T10:00:00Z"), "Europe/Warsaw", "21:00", "07:00")).toBeNull();
    expect(quietWindowEnd(at("2026-09-29T05:00:00Z"), "Europe/Warsaw", "21:00", "07:00")).toBeNull(); // exactly 07:00 local
  });

  it("uses the recipient's zone, not the server's", () => {
    // 22:30 UTC = 17:30 in Mexico City (UTC-6) → outside; the same instant is inside for Warsaw
    expect(quietWindowEnd(at("2026-09-28T22:30:00Z"), "America/Mexico_City", "21:00", "07:00")).toBeNull();
    expect(quietWindowEnd(at("2026-09-28T22:30:00Z"), "Europe/Warsaw", "21:00", "07:00")).not.toBeNull();
  });

  it("handles a same-day window and an empty one, and falls back to UTC for a bad zone", () => {
    expect(quietWindowEnd(at("2026-09-28T13:30:00Z"), "UTC", "13:00", "14:00")?.toISOString()).toBe("2026-09-28T14:00:00.000Z");
    expect(quietWindowEnd(at("2026-09-28T13:30:00Z"), "UTC", "13:00", "13:00")).toBeNull();
    expect(quietWindowEnd(at("2026-09-28T13:30:00Z"), "Not/AZone", "13:00", "14:00")?.toISOString()).toBe("2026-09-28T14:00:00.000Z");
  });
});

describe("isChannelEnabled", () => {
  const user = [{ category: "operational", channel: "push", enabled: true }];
  const tenantOff = { operational: { push: false, email: false } };

  it("resolves user row → tenant default → catalog default", () => {
    expect(isChannelEnabled("operational", "push", user, tenantOff)).toBe(true); // user beats tenant
    expect(isChannelEnabled("operational", "email", user, tenantOff)).toBe(false); // tenant beats catalog
    expect(isChannelEnabled("operational", "sms", user, tenantOff)).toBe(true); // catalog default
  });

  it("honours the seeded channel-wide shape ({\"sms\": false}) below a per-category value", () => {
    expect(isChannelEnabled("operational", "sms", [], { sms: false })).toBe(false);
    expect(isChannelEnabled("operational", "sms", [], { sms: false, operational: { sms: true } })).toBe(true);
  });

  it("never turns off security or legal", () => {
    const off = [{ category: "security", channel: "email", enabled: false }];
    expect(isChannelEnabled("security", "email", off, { security: { email: false } })).toBe(true);
    expect(isChannelEnabled("legal", "push", [], { legal: { push: false } })).toBe(true);
  });
});

describe("resolveChannels", () => {
  const night = at("2026-09-28T20:30:00Z"); // 22:30 Warsaw
  const recipient: RecipientPreferences = { prefs: [], settings: DEFAULT_NOTIFICATION_SETTINGS, timeZone: "Europe/Warsaw" };

  it("always includes in_app, defers push inside quiet hours, never defers in_app", () => {
    const out = resolveChannels(NOTIFICATION_CATALOG.appointment_booked, recipient, {}, night);
    expect(out[0]).toEqual({ channel: "in_app" });
    expect(out[1]?.channel).toBe("push");
    expect(out[1]?.notBefore?.toISOString()).toBe("2026-09-29T05:00:00.000Z");
  });

  it("drops a channel the user turned off, and sends at once with quiet hours disabled", () => {
    const off = { ...recipient, prefs: [{ category: "operational", channel: "push", enabled: false }] };
    expect(resolveChannels(NOTIFICATION_CATALOG.appointment_booked, off, {}, night).map((c) => c.channel)).toEqual(["in_app"]);

    const noQuiet = { ...recipient, settings: { ...DEFAULT_NOTIFICATION_SETTINGS, quiet_enabled: false } };
    expect(resolveChannels(NOTIFICATION_CATALOG.appointment_booked, noQuiet, {}, night)[1]).toEqual({ channel: "push" });
  });

  it("locked categories ignore both preferences and quiet hours", () => {
    const securityEvent: NotificationEventDefinition = { ...NOTIFICATION_CATALOG.appointment_booked, category: "security", channels: ["in_app", "email"] };
    const off = { ...recipient, prefs: [{ category: "security", channel: "email", enabled: false }] };
    expect(resolveChannels(securityEvent, off, {}, night)).toEqual([{ channel: "in_app" }, { channel: "email" }]);
  });
});
