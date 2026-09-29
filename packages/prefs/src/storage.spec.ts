import { describe, it, expect, beforeEach } from "vitest";
import { prefsKey, readPref, writePref, pruneExpired, sanitize, MAX_AGE_MS } from "./storage";

const DAY = 24 * 60 * 60 * 1000;
const alice = { tenant: "acme", userId: "u-1" };
const bob = { tenant: "acme", userId: "u-2" };

describe("prefsKey", () => {
  it("is versioned and scoped to tenant + user", () => {
    expect(prefsKey(alice, "view:patients:filters")).toBe("neo:v1:acme:u-1:view:patients:filters");
    expect(prefsKey(alice, "x")).not.toBe(prefsKey(bob, "x"));
    expect(prefsKey({ tenant: "other", userId: "u-1" }, "x")).not.toBe(prefsKey(alice, "x"));
  });
});

describe("readPref / writePref", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a value", () => {
    const key = prefsKey(alice, "s");
    expect(writePref(localStorage, key, { a: 1 }, 1000)).toBe(true);
    expect(readPref(localStorage, key, 2000)).toEqual({ a: 1 });
  });

  it("returns undefined for a missing or malformed entry", () => {
    expect(readPref(localStorage, "neo:v1:acme:u-1:none", 0)).toBeUndefined();
    localStorage.setItem("neo:v1:acme:u-1:bad", "{not json");
    expect(readPref(localStorage, "neo:v1:acme:u-1:bad", 0)).toBeUndefined();
    localStorage.setItem("neo:v1:acme:u-1:shape", JSON.stringify({ nope: true }));
    expect(readPref(localStorage, "neo:v1:acme:u-1:shape", 0)).toBeUndefined();
  });

  it("forgets and removes an entry unused for longer than 90 days", () => {
    const key = prefsKey(alice, "s");
    writePref(localStorage, key, "x", 0);
    expect(readPref(localStorage, key, MAX_AGE_MS)).toBe("x");
    expect(readPref(localStorage, key, MAX_AGE_MS + 1)).toBeUndefined();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("works with no storage at all (private mode / blocked)", () => {
    expect(writePref(null, "k", 1, 0)).toBe(false);
    expect(readPref(null, "k", 0)).toBeUndefined();
  });

  it("does not throw when the browser refuses the write (quota)", () => {
    const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); }, removeItem: () => {}, key: () => null, length: 0 };
    expect(writePref(full, "k", 1, 0)).toBe(false);
  });
});

describe("pruneExpired", () => {
  beforeEach(() => localStorage.clear());

  it("removes only expired neo:v1 entries, never other keys", () => {
    writePref(localStorage, prefsKey(alice, "old"), 1, 0);
    writePref(localStorage, prefsKey(bob, "fresh"), 1, 80 * DAY);
    localStorage.setItem("neosleep-theme", "dark");
    expect(pruneExpired(localStorage, 91 * DAY)).toBe(1);
    expect(localStorage.getItem(prefsKey(alice, "old"))).toBeNull();
    expect(localStorage.getItem(prefsKey(bob, "fresh"))).not.toBeNull();
    expect(localStorage.getItem("neosleep-theme")).toBe("dark");
  });
});

describe("sanitize", () => {
  const defaults = {
    status: [] as string[],
    owner: "",
    itemsPerPage: 10,
    sortBy: [{ key: "created_at", order: "desc" }],
  };

  it("keeps values that match the default's shape", () => {
    const v = { status: ["new"], owner: "u-9", itemsPerPage: 25, sortBy: [{ key: "name", order: "asc" }] };
    expect(sanitize(v, defaults)).toEqual(v);
  });

  it("falls back to the default for anything of the wrong type, and drops unknown keys", () => {
    const v = { status: "new", owner: 5, itemsPerPage: "25", sortBy: [{ key: 1 }], hacked: true };
    expect(sanitize(v, defaults)).toEqual(defaults);
  });

  it("drops bad items inside arrays instead of the whole array", () => {
    expect(sanitize({ status: ["a", 3, null, "b"] }, defaults).status).toEqual(["a", "b"]);
  });

  it("returns a copy of the defaults for garbage input", () => {
    for (const junk of [undefined, null, 42, "x", []]) {
      const out = sanitize(junk, defaults);
      expect(out).toEqual(defaults);
      expect(out).not.toBe(defaults);
    }
  });

  it("rejects NaN / Infinity numbers", () => {
    expect(sanitize({ itemsPerPage: Number.NaN }, defaults).itemsPerPage).toBe(10);
  });
});
