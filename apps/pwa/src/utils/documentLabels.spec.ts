import { describe, it, expect } from "vitest";
import { documentLabelKey } from "./documentLabels";

describe("documentLabelKey", () => {
  it("passes a plain templateKey through unchanged", () => {
    expect(documentLabelKey("informedConsent")).toBe("user.document-content.labels.informedConsent");
  });

  it("strips the dot and capitalizes the next letter for a dotted templateKey", () => {
    expect(documentLabelKey("gdprConsent.pl")).toBe("user.document-content.labels.gdprConsentPl");
    expect(documentLabelKey("gdprConsent.mx")).toBe("user.document-content.labels.gdprConsentMx");
  });

  it("returns null for an empty templateKey", () => {
    expect(documentLabelKey("")).toBeNull();
  });
});
