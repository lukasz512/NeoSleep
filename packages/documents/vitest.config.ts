import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: false,
    // Without this, tsc's own compiled dist/*.spec.js output (tsconfig.json
    // includes all of src/, spec files included) gets picked up by vitest's
    // default include glob as a SECOND copy of every test file — same
    // exclusion apps/api's vitest.config.ts already uses.
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
