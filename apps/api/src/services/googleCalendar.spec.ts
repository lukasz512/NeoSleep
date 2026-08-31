import { describe, it, expect, vi, beforeEach } from "vitest";

// googleapis is the external boundary here — mocked so these tests don't hit
// a real Google Calendar. env.js is re-mocked per test via importService()
// below so both the "configured" and "not configured" code paths are covered.
const freebusyQueryMock = vi.fn();
const eventsInsertMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    // Arrow functions can't be used as constructors — OAuth2 is called with `new`.
    auth: { OAuth2: vi.fn().mockImplementation(function OAuth2() { return { setCredentials: vi.fn() }; }) },
    calendar: vi.fn(() => ({
      freebusy: { query: freebusyQueryMock },
      events: { insert: eventsInsertMock },
    })),
  },
}));

const CALENDAR_ID = "neosleepcare@gmail.com";

/** A start/end 10 days out — safely inside the [1 day, 2 months] bookable window regardless of when the test runs. */
function validSlotFixture(): { start: string; end: string } {
  const start = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  start.setUTCHours(12, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

beforeEach(() => {
  freebusyQueryMock.mockReset();
  eventsInsertMock.mockReset();
  freebusyQueryMock.mockResolvedValue({ data: { calendars: { [CALENDAR_ID]: { busy: [] } } } });
  eventsInsertMock.mockResolvedValue({ data: {} });
});

/**
 * Re-mocks env.js and re-imports the module fresh so each test gets its own
 * configured/unconfigured env — and imports errors.js from the SAME reset
 * cycle, so `instanceof` checks against the thrown errors stay valid (a
 * statically-imported error class would be a different module instance).
 */
async function importService(configured: boolean, extraAttendees: string[] = []) {
  vi.doMock("../env.js", () => ({
    GOOGLE_CALENDAR_CLIENT_ID: configured ? "test-client-id" : undefined,
    GOOGLE_CALENDAR_CLIENT_SECRET: configured ? "test-client-secret" : undefined,
    GOOGLE_CALENDAR_REFRESH_TOKEN: configured ? "test-refresh-token" : undefined,
    GOOGLE_CALENDAR_ID: CALENDAR_ID,
    GOOGLE_CALENDAR_EXTRA_ATTENDEES: extraAttendees,
  }));
  vi.resetModules();
  const service = await import("./googleCalendar.js");
  const errors = await import("../errors.js");
  return { ...service, ...errors };
}

describe("googleCalendar service", () => {
  it("throws PartnerServiceError when Google Calendar credentials are not configured", async () => {
    const { getSlots, PartnerServiceError } = await importService(false);
    await expect(getSlots()).rejects.toThrow(PartnerServiceError);
  });

  it("only returns business-hours slots (Mon-Fri, 10:00-20:00 CET)", async () => {
    const { getSlots } = await importService(true);
    const slots = await getSlots({ days: 5 });
    expect(slots.length).toBeGreaterThan(0);

    for (const slot of slots) {
      const start = new Date(slot.start);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", weekday: "short" }).format(start);
      expect(["Sat", "Sun"]).not.toContain(weekday);

      const hour = parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" }).format(start),
        10
      );
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThan(20);
    }
  });

  it("flags a slot that overlaps a busy period as unavailable, without omitting it", async () => {
    const { getSlots } = await importService(true);
    const baseline = await getSlots({ days: 3 });
    expect(baseline.length).toBeGreaterThan(0);
    expect(baseline.every((s) => s.available)).toBe(true);
    const busySlot = baseline[0]!;

    freebusyQueryMock.mockResolvedValue({
      data: { calendars: { [CALENDAR_ID]: { busy: [{ start: busySlot.start, end: busySlot.end }] } } },
    });

    const withBusy = await getSlots({ days: 3 });
    expect(withBusy.length).toBe(baseline.length); // still present — just flagged, not hidden
    expect(withBusy.find((s) => s.start === busySlot.start)?.available).toBe(false);
    expect(withBusy.filter((s) => s.available).length).toBe(baseline.length - 1);
  });

  it("bookSlot rejects an invalid email before touching the calendar", async () => {
    const { bookSlot, ValidationError } = await importService(true);
    const { start, end } = validSlotFixture();
    await expect(bookSlot({ start, end, name: "Dr. Test", email: "not-an-email" })).rejects.toThrow(ValidationError);
    expect(eventsInsertMock).not.toHaveBeenCalled();
  });

  it("bookSlot rejects a slot outside the 1-day..2-month bookable window", async () => {
    const { bookSlot, ValidationError } = await importService(true);
    const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h out — under the 1-day minimum
    const soonEnd = new Date(Date.now() + 2 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString();
    await expect(
      bookSlot({ start: soon, end: soonEnd, name: "Dr. Test", email: "doctor@example.com" })
    ).rejects.toThrow(ValidationError);
    expect(eventsInsertMock).not.toHaveBeenCalled();
  });

  it("bookSlot throws ConflictError and does not insert when the slot was just taken", async () => {
    const { bookSlot, ConflictError } = await importService(true);
    const { start, end } = validSlotFixture();
    freebusyQueryMock.mockResolvedValue({
      data: { calendars: { [CALENDAR_ID]: { busy: [{ start, end }] } } },
    });

    await expect(bookSlot({ start, end, name: "Dr. Test", email: "doctor@example.com" })).rejects.toThrow(ConflictError);
    expect(eventsInsertMock).not.toHaveBeenCalled();
  });

  it("bookSlot inserts a Meet event with sendUpdates 'all' when the slot is free", async () => {
    const { bookSlot } = await importService(true);
    const { start, end } = validSlotFixture();
    const result = await bookSlot({ start, end, name: "Dr. Test", email: "doctor@example.com" });

    expect(result).toEqual({ start, end });
    expect(eventsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: CALENDAR_ID,
        sendUpdates: "all",
        requestBody: expect.objectContaining({
          attendees: [expect.objectContaining({ email: "doctor@example.com" })],
        }),
      })
    );
  });

  it("includes GOOGLE_CALENDAR_EXTRA_ATTENDEES alongside the lead and returns the Meet link", async () => {
    const { bookSlot } = await importService(true, ["lukasz.ostrowski@neosleepcare.com", "alfred.jan@neosleepcare.com"]);
    const { start, end } = validSlotFixture();
    eventsInsertMock.mockResolvedValue({ data: { hangoutLink: "https://meet.google.com/abc-defg-hij" } });

    const result = await bookSlot({ start, end, name: "Dr. Test", email: "doctor@example.com" });

    expect(result.meetLink).toBe("https://meet.google.com/abc-defg-hij");
    expect(eventsInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          attendees: [
            expect.objectContaining({ email: "doctor@example.com" }),
            { email: "lukasz.ostrowski@neosleepcare.com" },
            { email: "alfred.jan@neosleepcare.com" },
          ],
        }),
      })
    );
  });
});
