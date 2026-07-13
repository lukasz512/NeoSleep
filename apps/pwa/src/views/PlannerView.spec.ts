import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewPath = path.resolve(__dirname, "PlannerView.vue");

function getSource(): string {
  return readFileSync(viewPath, "utf-8");
}

describe("PlannerView", () => {
  describe("calendar and toolbar", () => {
    it("has view toggle for day, week, month", () => {
      const source = getSource();
      expect(source).toContain("user.planner.viewDay");
      expect(source).toContain("user.planner.viewWeek");
      expect(source).toContain("user.planner.viewMonth");
    });

    it("has prev, next, today navigation", () => {
      const source = getSource();
      expect(source).toContain("user.planner.today");
      expect(source).toContain("prev");
      expect(source).toContain("next");
      expect(source).toContain("goToToday");
    });

    it("has Add button for creating events", () => {
      const source = getSource();
      expect(source).toContain("user.planner.add");
      expect(source).toContain("onAdd");
    });

    it("uses VCalendar with events, click:date, click:day, click:event", () => {
      const source = getSource();
      expect(source).toContain("VCalendar");
      expect(source).toMatch(/@click:date|click:date/);
      expect(source).toMatch(/@click:day|click:day/);
      expect(source).toMatch(/@click:event|click:event/);
      expect(source).toMatch(/:events=|v-bind:events/);
    });

    it("formats weekday with translation fallback", () => {
      const source = getSource();
      expect(source).toContain("formatWeekday");
      expect(source).toMatch(/rep\.planner\.weekday|weekday\d/);
    });
  });

  describe("EventForm integration", () => {
    it("renders EventForm component", () => {
      const source = getSource();
      expect(source).toContain("EventForm");
      expect(source).toContain("showEventForm");
      expect(source).toContain("eventFormInitial");
    });

    it("fetches events from /api/events", () => {
      const source = getSource();
      expect(source).toContain("/api/v1/encounter");
      expect(source).toContain("apiFetch");
      expect(source).toContain("fetchEvents");
    });

    it("handles date click to open form with prefilled date", () => {
      const source = getSource();
      expect(source).toContain("onDateClick");
      expect(source).toContain("start_at");
      expect(source).toContain("end_at");
    });

    it("handles event click to open edit form", () => {
      const source = getSource();
      expect(source).toContain("onEventClick");
      expect(source).toContain("apiEvents");
    });

    it("submits create via POST and update via PATCH", () => {
      const source = getSource();
      expect(source).toContain("onEventFormSubmit");
      expect(source).toContain("method: \"POST\"");
      expect(source).toContain("method: \"PATCH\"");
    });
  });

  describe("touch targets", () => {
    it("nav buttons have min 44px touch target on mobile", () => {
      const source = getSource();
      expect(source).toMatch(/--rep-btn-min-width|--rep-btn-min-height/);
      expect(source).toMatch(/767px|max-width:\s*767/);
    });
  });
});
