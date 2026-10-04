import { describe, it, expect } from "vitest";
import { calendarTargets } from "./calendarTargets";

/**
 * CORE-116 P3: one big button for the calendar the patient most likely uses,
 * the rest smaller. There is no single link every calendar accepts: .ics opens
 * Apple, Samsung and Outlook; the Google Calendar app needs its own link.
 */
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const SAMSUNG = "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

describe("calendarTargets", () => {
  it("iPhone → Apple Calendar via .ics first", () => {
    const t = calendarTargets(IPHONE);
    expect(t.primary).toEqual({ kind: "ics", labelKey: "publicAppointment.calendarApple" });
    expect(t.others.map((o) => o.kind)).toEqual(["google", "outlook"]);
  });

  it("Mac / iPad (desktop UA) → Apple Calendar first too", () => {
    expect(calendarTargets(IPAD_DESKTOP_UA).primary.labelKey).toBe("publicAppointment.calendarApple");
  });

  it("Android (Samsung) → the phone's own calendar via .ics first, Google right below", () => {
    const t = calendarTargets(SAMSUNG);
    expect(t.primary).toEqual({ kind: "ics", labelKey: "publicAppointment.calendarPhone", hintKey: "publicAppointment.calendarPhoneHint" });
    expect(t.others[0]?.kind).toBe("google");
  });

  it("desktop → Google first, then Outlook and the .ics file for anything else", () => {
    const t = calendarTargets(WINDOWS);
    expect(t.primary.kind).toBe("google");
    expect(t.others.map((o) => o.kind)).toEqual(["outlook", "ics"]);
  });
});
