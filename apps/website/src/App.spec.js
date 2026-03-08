import { describe, it, expect } from "vitest";
import router from "./router";
describe("Website app", () => {
    it("router has home and about routes", () => {
        const names = router.getRoutes().map((r) => r.name);
        expect(names).toContain("home");
        expect(names).toContain("about");
    });
    it("catch-all redirects to home", () => {
        const catchAll = router.getRoutes().find((r) => r.path === "/:pathMatch(.*)*");
        expect(catchAll?.redirect).toBe("/");
    });
});
