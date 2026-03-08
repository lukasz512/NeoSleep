import { describe, it, expect, beforeEach } from "vitest";
import { useGlobalLoader } from "./useGlobalLoader";

describe("useGlobalLoader", () => {
  beforeEach(() => {
    const { stopLoading } = useGlobalLoader();
    for (let i = 0; i < 20; i++) stopLoading();
  });

  it("isLoading is false initially", () => {
    const { isLoading } = useGlobalLoader();
    expect(isLoading.value).toBe(false);
  });

  it("startLoading sets isLoading to true", () => {
    const { isLoading, startLoading } = useGlobalLoader();
    startLoading();
    expect(isLoading.value).toBe(true);
  });

  it("stopLoading sets isLoading back to false", () => {
    const { isLoading, startLoading, stopLoading } = useGlobalLoader();
    startLoading();
    expect(isLoading.value).toBe(true);
    stopLoading();
    expect(isLoading.value).toBe(false);
  });

  it("multiple startLoading require multiple stopLoading (counter-based)", () => {
    const { isLoading, startLoading, stopLoading } = useGlobalLoader();
    startLoading();
    startLoading();
    expect(isLoading.value).toBe(true);
    stopLoading();
    expect(isLoading.value).toBe(true);
    stopLoading();
    expect(isLoading.value).toBe(false);
  });

  it("stopLoading does not go below zero", () => {
    const { isLoading, stopLoading } = useGlobalLoader();
    stopLoading();
    stopLoading();
    expect(isLoading.value).toBe(false);
  });
});
