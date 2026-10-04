import { describe, it, expect } from "vitest";
import { localHourDaysBefore, scheduledAppointmentAction, bookingStamps } from "./appointmentSchedule.js";

/**
 * CORE-116 (decision form confirm-flow-r1): the patient is asked to confirm
 * 2 days before at 10:00 clinic time; the day before at 10:00 a confirmed
 * patient gets a reminder and an unconfirmed one is asked again.
 */
const MX = "America/Mexico_City"; // UTC-6, no daylight saving since 2022
const WARSAW = "Europe/Warsaw";

describe("localHourDaysBefore", () => {
  it("is 10:00 clinic time two days before the visit's local date", () => {
    // Visit Thu 2031-01-16 09:00 in Mexico City = 15:00 UTC.
    const at = localHourDaysBefore("2031-01-16T15:00:00.000Z", MX, 2, 10);
    expect(at.toISOString()).toBe("2031-01-14T16:00:00.000Z");
  });

  it("uses the local date, not the UTC one (late-evening visit)", () => {
    // Visit 2031-01-16 20:00 Mexico City = 2031-01-17 02:00 UTC → local date is the 16th.
    const at = localHourDaysBefore("2031-01-17T02:00:00.000Z", MX, 1, 10);
    expect(at.toISOString()).toBe("2031-01-15T16:00:00.000Z");
  });

  it("follows daylight saving where the clinic has it", () => {
    // Warsaw summer = UTC+2: 10:00 local is 08:00 UTC.
    const at = localHourDaysBefore("2031-07-10T08:00:00.000Z", WARSAW, 1, 10);
    expect(at.toISOString()).toBe("2031-07-09T08:00:00.000Z");
  });
});

describe("scheduledAppointmentAction", () => {
  const visit = { start_at: "2031-01-16T15:00:00.000Z", timezone: MX, status: "scheduled" as const };
  const askAt = new Date("2031-01-14T16:00:00.000Z");
  const dayBeforeAt = new Date("2031-01-15T16:00:00.000Z");
  const fresh = { ...visit, patient_response: null, confirm_request_sent_at: null, day_before_sent_at: null };

  it("does nothing before the ask time", () => {
    expect(scheduledAppointmentAction(fresh, new Date(askAt.getTime() - 60_000))).toBeNull();
  });

  it("asks to confirm from 10:00 two days before", () => {
    expect(scheduledAppointmentAction(fresh, askAt)).toBe("confirm_request");
  });

  it("does not ask twice", () => {
    expect(scheduledAppointmentAction({ ...fresh, confirm_request_sent_at: askAt.toISOString() }, new Date(askAt.getTime() + 3_600_000))).toBeNull();
  });

  it("a patient who already confirmed is not asked; the ask is only stamped", () => {
    expect(scheduledAppointmentAction({ ...fresh, patient_response: "confirmed" }, askAt)).toBe("stamp_confirm_request");
  });

  it("the day before: confirmed → reminder", () => {
    expect(scheduledAppointmentAction({ ...fresh, patient_response: "confirmed", confirm_request_sent_at: askAt.toISOString() }, dayBeforeAt)).toBe("reminder");
  });

  it("the day before: still no answer → asked again (and the clinic is told)", () => {
    expect(scheduledAppointmentAction({ ...fresh, confirm_request_sent_at: askAt.toISOString() }, dayBeforeAt)).toBe("confirm_again");
  });

  it("the day before: 'can't come' → nothing to send", () => {
    expect(scheduledAppointmentAction({ ...fresh, patient_response: "cannot_attend", confirm_request_sent_at: askAt.toISOString() }, dayBeforeAt)).toBe("stamp_day_before");
  });

  it("a tick that missed the 2-day slot goes straight to the day-before step", () => {
    expect(scheduledAppointmentAction(fresh, dayBeforeAt)).toBe("confirm_again");
  });

  it("nothing for a visit that started, was cancelled, or is fully handled", () => {
    expect(scheduledAppointmentAction(fresh, new Date(visit.start_at))).toBeNull();
    expect(scheduledAppointmentAction({ ...fresh, status: "cancelled" }, dayBeforeAt)).toBeNull();
    expect(scheduledAppointmentAction({ ...fresh, confirm_request_sent_at: askAt.toISOString(), day_before_sent_at: dayBeforeAt.toISOString() }, dayBeforeAt)).toBeNull();
  });
});

describe("bookingStamps (P2: the booking email asks only when the 2-day ask time has passed)", () => {
  const start = "2031-01-16T15:00:00.000Z";

  it("a visit weeks away: no question in the booking email, nothing stamped", () => {
    expect(bookingStamps(start, MX, new Date("2031-01-01T12:00:00.000Z"))).toEqual({ askNow: false, confirmRequest: false, dayBefore: false });
  });

  it("booked inside the 2-day window: asks now and stamps the ask", () => {
    expect(bookingStamps(start, MX, new Date("2031-01-14T18:00:00.000Z"))).toEqual({ askNow: true, confirmRequest: true, dayBefore: false });
  });

  it("booked after 10:00 the day before: asks now, no separate day-before email", () => {
    expect(bookingStamps(start, MX, new Date("2031-01-15T20:00:00.000Z"))).toEqual({ askNow: true, confirmRequest: true, dayBefore: true });
  });
});
