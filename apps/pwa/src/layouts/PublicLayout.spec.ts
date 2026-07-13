import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("PublicLayout", () => {
  const layoutPath = path.resolve(__dirname, "PublicLayout.vue");
  const source = readFileSync(layoutPath, "utf-8");

  describe("template structure", () => {
    it("uses wrapper with layout-public class", () => {
      expect(source).toContain("layout-public");
      expect(source).toMatch(/class="[^"]*layout-public[^"]*"/);
    });

    it("renders router outlet for child routes", () => {
      expect(source).toMatch(/<router-view\s*\/?>|<RouterView\s*\/?>/);
    });

    it("has no sidebar or app chrome (minimal wrapper)", () => {
      expect(source).not.toContain("layout-app");
      expect(source).not.toContain("AppSidebar");
    });
  });

  describe("styles", () => {
    it("layout-public has full viewport min-height and padding", () => {
      expect(source).toMatch(/\.layout-public\s*\{[\s\S]*?min-height:\s*100vh/);
      expect(source).toMatch(/\.layout-public\s*\{[\s\S]*?padding:\s*16px/);
    });

    it("styles are scoped", () => {
      expect(source).toMatch(/<style[^>]*\sscoped/);
    });
  });

  describe("script", () => {
    it("uses script setup and has no required props", () => {
      expect(source).toContain("<script setup");
      expect(source).not.toMatch(/defineProps\s*<\s*\{[^}]*\w+[^}]*\}>/);
    });
  });
});
