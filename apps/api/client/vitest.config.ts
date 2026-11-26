import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: false,
    environment: "node",
    include: ["src/**/*.spec.ts"],
  },
});
