import { describe, it, expect } from "vitest";

describe("fetch guard (vitest setupFile)", () => {
  it("rejects any fetch to an apneadock host before it leaves the process", async () => {
    await expect(fetch("https://apneadock.es/api/login", { method: "POST" })).rejects.toThrow(/fetch-guard/);
    await expect(fetch(new URL("https://www.APNEADOCK.com/api/treatments"))).rejects.toThrow(/fetch-guard/);
  });
});
