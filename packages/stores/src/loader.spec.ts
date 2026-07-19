import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useGlobalLoaderStore } from "./loader";

describe("global loader store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("isLoading is false initially", () => {
    const store = useGlobalLoaderStore();
    expect(store.isLoading).toBe(false);
  });

  it("startLoading sets isLoading to true", () => {
    const store = useGlobalLoaderStore();
    store.startLoading();
    expect(store.isLoading).toBe(true);
  });

  it("stopLoading sets isLoading back to false", () => {
    const store = useGlobalLoaderStore();
    store.startLoading();
    expect(store.isLoading).toBe(true);
    store.stopLoading();
    expect(store.isLoading).toBe(false);
  });

  it("multiple startLoading require multiple stopLoading (counter-based)", () => {
    const store = useGlobalLoaderStore();
    store.startLoading();
    store.startLoading();
    expect(store.isLoading).toBe(true);
    store.stopLoading();
    expect(store.isLoading).toBe(true);
    store.stopLoading();
    expect(store.isLoading).toBe(false);
  });

  it("stopLoading does not go below zero", () => {
    const store = useGlobalLoaderStore();
    store.stopLoading();
    store.stopLoading();
    expect(store.isLoading).toBe(false);
  });

  it("is shared across every useGlobalLoaderStore() call within the same Pinia instance", () => {
    const a = useGlobalLoaderStore();
    const b = useGlobalLoaderStore();
    a.startLoading();
    expect(b.isLoading).toBe(true);
  });
});
