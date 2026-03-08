import { describe, it, expect } from "vitest";
import { getNextTheme, isValidTheme } from "./theme";
describe("theme utils", () => {
    describe("getNextTheme", () => {
        it("returns dark when current is light", () => {
            expect(getNextTheme("light")).toBe("dark");
        });
        it("returns light when current is dark", () => {
            expect(getNextTheme("dark")).toBe("light");
        });
    });
    describe("isValidTheme", () => {
        it("returns true for light and dark", () => {
            expect(isValidTheme("light")).toBe(true);
            expect(isValidTheme("dark")).toBe(true);
        });
        it("returns false for invalid values", () => {
            expect(isValidTheme("")).toBe(false);
            expect(isValidTheme("blue")).toBe(false);
            expect(isValidTheme("en")).toBe(false);
        });
    });
});
