import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(__dirname, "useBffApi.ts");
function getSource() {
    return readFileSync(sourcePath, "utf-8");
}
describe("useBffApi", () => {
    describe("error notification display (do not change – see OBSERVABILITY_AND_LOGGING.md)", () => {
        it("parses JSON response and extracts error or message – never shows raw JSON in notification", () => {
            const source = getSource();
            expect(source).toContain("JSON.parse(bodyText)");
            expect(source).toMatch(/json\.error|json\.message/);
            expect(source).toContain("notifications.show");
        });
        it("extracts error field from JSON object", () => {
            const source = getSource();
            expect(source).toMatch(/json\.error\s*\?\?\s*json\.message/);
        });
        it("handles double-encoded JSON (message that still looks like JSON)", () => {
            const source = getSource();
            expect(source).toContain("startsWith");
            expect(source).toContain("inner");
            expect(source).toContain("inner.error");
        });
        it("documents the rule in JSDoc", () => {
            const source = getSource();
            expect(source).toContain("Error notification display (do not change)");
            expect(source).toContain("Never show raw JSON in the notification");
        });
    });
});
