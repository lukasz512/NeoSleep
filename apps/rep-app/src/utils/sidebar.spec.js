import { describe, it, expect } from "vitest";
import { parseSidebarCollapsed } from "./sidebar";
import { SIDEBAR_DEFAULT_COLLAPSED } from "../constants";
describe("sidebar utils", () => {
    describe("parseSidebarCollapsed", () => {
        it('returns true when saved is "true"', () => {
            expect(parseSidebarCollapsed("true")).toBe(true);
        });
        it('returns false when saved is "false"', () => {
            expect(parseSidebarCollapsed("false")).toBe(false);
        });
        it("returns default (false) when saved is null", () => {
            expect(parseSidebarCollapsed(null)).toBe(SIDEBAR_DEFAULT_COLLAPSED);
        });
        it("returns default when saved is invalid string", () => {
            expect(parseSidebarCollapsed("")).toBe(SIDEBAR_DEFAULT_COLLAPSED);
            expect(parseSidebarCollapsed("1")).toBe(SIDEBAR_DEFAULT_COLLAPSED);
            expect(parseSidebarCollapsed("True")).toBe(SIDEBAR_DEFAULT_COLLAPSED);
        });
    });
});
