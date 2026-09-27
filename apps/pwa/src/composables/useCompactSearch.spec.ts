import { describe, it, expect } from "vitest";
import { MIN_SEARCH_WIDTH, REOPEN_SLACK, nextCompact } from "./useCompactSearch";

// NEO-152: the list title (and its subtitle) keeps its width; the search gets the rest.
describe("nextCompact (desktop search yields to the title)", () => {
  const rest = 140; // filter + add + gaps

  it("keeps the full field while at least MIN_SEARCH_WIDTH is left for it", () => {
    expect(nextCompact({ compact: false, row: 300 + rest + MIN_SEARCH_WIDTH, title: 300, rest })).toBe(false);
  });

  it("collapses to the icon once less than that is left — the title never runs under it", () => {
    expect(nextCompact({ compact: false, row: 300 + rest + MIN_SEARCH_WIDTH - 1, title: 300, rest })).toBe(true);
  });

  it("only grows back with some slack, so it can't flip on its own width", () => {
    const row = 300 + rest + MIN_SEARCH_WIDTH + REOPEN_SLACK / 2;
    expect(nextCompact({ compact: true, row, title: 300, rest })).toBe(true);
    expect(nextCompact({ compact: true, row: row + REOPEN_SLACK, title: 300, rest })).toBe(false);
  });
});
