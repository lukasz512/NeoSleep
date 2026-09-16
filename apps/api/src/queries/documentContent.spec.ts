import { describe, it, expect } from "vitest";
import { withPlatform } from "../db/tenant.js";
import { insertDocumentContentVersion } from "../db/documentContent.js";
import {
  GetDocumentContentIndexQuery,
  GetCurrentDocumentContentQuery,
  ListDocumentContentVersionsQuery,
  GetDocumentContentVersionByIdQuery,
} from "./documentContent.js";
import { NotFoundError } from "../errors.js";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("GetDocumentContentIndexQuery", () => {
  it("lists every real (non-hidden) manifest entry and never the hidden __test fixture", async () => {
    const index = await GetDocumentContentIndexQuery();
    const keys = index.map((e) => e.templateKey);
    expect(keys).toContain("informedConsent");
    expect(keys).toContain("gdprConsent.pl");
    expect(keys).toContain("gdprConsent.mx");
    expect(keys).not.toContain("__test");
  });

  it("includes gdprConsent.pl/gdprConsent.mx only for their own single locale, not every locale", async () => {
    const index = await GetDocumentContentIndexQuery();
    const plEntries = index.filter((e) => e.templateKey === "gdprConsent.pl");
    expect(plEntries.map((e) => e.locale)).toEqual(["pl"]);
    const mxEntries = index.filter((e) => e.templateKey === "gdprConsent.mx");
    expect(mxEntries.map((e) => e.locale)).toEqual(["mx"]);
  });
});

describe("GetCurrentDocumentContentQuery", () => {
  it("throws NotFoundError for an unseeded template_key/locale", async () => {
    await expect(
      GetCurrentDocumentContentQuery(`qa-query-nonexistent-${uniqueSuffix()}`, "en")
    ).rejects.toThrow(NotFoundError);
  });

  it("returns the current version once one exists", async () => {
    const templateKey = `qa-query-fixture-${uniqueSuffix()}`;
    await withPlatform((client) =>
      insertDocumentContentVersion(client, {
        templateKey,
        locale: "en",
        contentHtml: "<p>content</p>",
        createdByUserId: "00000000-0000-0000-0000-000000000000",
        createdByName: "QA",
        createdByEmail: "qa@neosleepcare.com",
        createdByTenantSlug: "test",
      })
    );

    const current = await GetCurrentDocumentContentQuery(templateKey, "en");
    expect(current.content_html).toBe("<p>content</p>");
  });
});

describe("ListDocumentContentVersionsQuery / GetDocumentContentVersionByIdQuery", () => {
  it("lists saved versions newest-first and fetches one by id", async () => {
    const templateKey = `qa-query-history-${uniqueSuffix()}`;
    const inputBase = {
      locale: "en",
      createdByUserId: "00000000-0000-0000-0000-000000000000",
      createdByName: "QA",
      createdByEmail: "qa@neosleepcare.com",
      createdByTenantSlug: "test",
    };
    await withPlatform((client) =>
      insertDocumentContentVersion(client, { ...inputBase, templateKey, contentHtml: "<p>v1</p>" })
    );
    const v2 = await withPlatform((client) =>
      insertDocumentContentVersion(client, { ...inputBase, templateKey, contentHtml: "<p>v2</p>" })
    );

    const versions = await ListDocumentContentVersionsQuery(templateKey, "en");
    expect(versions.map((v) => v.version_number)).toEqual([2, 1]);

    const byId = await GetDocumentContentVersionByIdQuery(v2.id);
    expect(byId.content_html).toBe("<p>v2</p>");
  });

  it("GetDocumentContentVersionByIdQuery throws NotFoundError for a nonexistent id", async () => {
    await expect(
      GetDocumentContentVersionByIdQuery("00000000-0000-0000-0000-000000000000")
    ).rejects.toThrow(NotFoundError);
  });
});
