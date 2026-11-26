import { describe, it, expect } from "vitest";
import { harnessPort } from "./harnessPort";

// CORE-126: each worktree gets its own harness port, so parallel pre-pushes don't collide.
describe("harnessPort", () => {
  const a = "/repo/.claude/worktrees/neo-228-clinico-block-redesign/apps/pwa/";
  const b = "/repo/.claude/worktrees/neo-236-palette-contrast/apps/pwa/";

  it("is stable for one worktree and differs between two", () => {
    expect(harnessPort(a)).toBe(harnessPort(a));
    expect(harnessPort(a)).not.toBe(harnessPort(b));
  });

  it("stays in 5200–5999, clear of vite's 5173 and the old fixed 5199", () => {
    for (const dir of [a, b, "/", "/x".repeat(500)]) {
      expect(harnessPort(dir)).toBeGreaterThanOrEqual(5200);
      expect(harnessPort(dir)).toBeLessThan(6000);
    }
  });
});
