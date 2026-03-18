import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "AppNotificationHub.vue");

function getAppNotificationHubSource(): string {
  return readFileSync(componentPath, "utf-8");
}

describe("AppNotificationHub", () => {
  describe("responsive location and layout", () => {
    it("uses top center on mobile and bottom right on desktop", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("isMobile ? 'top center' : 'bottom right'");
      expect(source).toMatch(/:location=".*isMobile/);
    });

    it("adds app-notification-hub--mobile class when on mobile", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("app-notification-hub--mobile");
      expect(source).toMatch(/'app-notification-hub--mobile':\s*isMobile/);
    });
  });

  describe("arrow direction", () => {
    it("shows up arrow on mobile and right arrow on desktop", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain('v-if="isMobile"');
      expect(source).toContain('d="M18 15l-6-6-6 6"'); // chevron up
      expect(source).toContain('d="M9 18l6-6-6-6"'); // chevron right
    });
  });

  describe("exit animation", () => {
    it("uses translateY(-100%) for mobile exit and translateX for desktop", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("app-notification-hub__wrap--exiting-mobile");
      expect(source).toContain("translateY(-100%)");
      expect(source).toContain("app-notification-hub__wrap--exiting");
      expect(source).toContain("translateX");
    });
  });

  describe("touch handlers", () => {
    it("tracks touchStartY for vertical swipe on mobile", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("touchStartY");
      expect(source).toContain("e.touches[0].clientY");
    });

    it("dismisses on pull-up (deltaY < -80) when mobile", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("deltaY < -80");
      expect(source).toContain("isMobile.value");
    });

    it("dismisses on swipe right (deltaX > 80) when desktop", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("deltaX > 80");
    });
  });

  describe("integration", () => {
    it("uses useDisplay with MOBILE_BREAKPOINT for responsive detection", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("useDisplay");
      expect(source).toContain("MOBILE_BREAKPOINT");
      expect(source).toContain("mobileBreakpoint");
    });

    it("timer is at top on mobile (app-notification-hub--mobile)", () => {
      const source = getAppNotificationHubSource();
      expect(source).toContain("app-notification-hub--mobile .app-notification-hub__timer");
      expect(source).toMatch(/top:\s*0|bottom:\s*auto/);
    });
  });
});
