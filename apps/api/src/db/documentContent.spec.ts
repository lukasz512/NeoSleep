import { describe, it, expect } from "vitest";
import { withPlatform } from "./tenant.js";
import {
  insertDocumentContentVersion,
  getCurrentDocumentContentVersion,
  listDocumentContentVersions,
  getDocumentContentVersionById,
  type InsertDocumentContentVersionInput,
} from "./documentContent.js";
import { ConflictError } from "../errors.js";

/**
 * platform.document_content_version is NOT tenant-isolated the way
 * DEFAULT_TENANT_SLUG=test protects the rest of this integration-test DB
 * (see commands/documentContent.spec.ts's own comment for the fuller
 * explanation) — these low-level db/ tests bypass template_key validation
 * entirely (they call insertDocumentContentVersion directly, not through
 * SaveDocumentContentVersionCommand), so they use fully-synthetic,
 * per-test-run-unique template_keys rather than any real manifest entry —
 * no shared-table pollution risk here at all, unlike the command/route
 * layer tests which are forced through the real "__test" manifest entry.
 */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseInput(overrides: Partial<InsertDocumentContentVersionInput> = {}): InsertDocumentContentVersionInput {
  return {
    templateKey: `qa-db-fixture-${uniqueSuffix()}`,
    locale: "en",
    contentHtml: "<p>hello</p>",
    createdByUserId: "00000000-0000-0000-0000-000000000000",
    createdByName: "QA Pilot",
    createdByEmail: "qa@neosleepcare.com",
    createdByTenantSlug: "test",
    ...overrides,
  };
}

describe("insertDocumentContentVersion / getCurrentDocumentContentVersion", () => {
  it("returns null for a template_key/locale with no rows yet", async () => {
    const result = await withPlatform((client) =>
      getCurrentDocumentContentVersion(client, `qa-db-nonexistent-${uniqueSuffix()}`, "en")
    );
    expect(result).toBeNull();
  });

  it("first save creates version_number=1, is_current=true", async () => {
    const input = baseInput();
    const version = await withPlatform((client) => insertDocumentContentVersion(client, input));
    expect(version.version_number).toBe(1);
    expect(version.is_current).toBe(true);

    const current = await withPlatform((client) =>
      getCurrentDocumentContentVersion(client, input.templateKey, input.locale)
    );
    expect(current?.id).toBe(version.id);
  });

  it("second save flips the first version's is_current to false and increments version_number", async () => {
    const templateKey = `qa-db-fixture-${uniqueSuffix()}`;
    const locale = "en";

    const v1 = await withPlatform((client) =>
      insertDocumentContentVersion(client, baseInput({ templateKey, locale, contentHtml: "<p>v1</p>" }))
    );
    const v2 = await withPlatform((client) =>
      insertDocumentContentVersion(client, baseInput({ templateKey, locale, contentHtml: "<p>v2</p>" }))
    );

    expect(v2.version_number).toBe(v1.version_number + 1);
    expect(v2.is_current).toBe(true);

    const current = await withPlatform((client) => getCurrentDocumentContentVersion(client, templateKey, locale));
    expect(current?.id).toBe(v2.id);
    expect(current?.content_html).toBe("<p>v2</p>");

    // v1's own row is untouched (content never mutated in place) — only its
    // is_current flag flipped. This is the concrete proof behind "a signed
    // PDF stays traceable to the exact content that was current when it was
    // generated": v1 is still readable, still says "<p>v1</p>", forever.
    const v1Reloaded = await withPlatform((client) => getDocumentContentVersionById(client, v1.id));
    expect(v1Reloaded?.content_html).toBe("<p>v1</p>");
    expect(v1Reloaded?.is_current).toBe(false);
  });

  it("a concurrent save race is resolved by the UNIQUE partial index, not silently — exactly one is_current row survives", async () => {
    const templateKey = `qa-db-race-${uniqueSuffix()}`;
    const locale = "en";

    const results = await Promise.allSettled([
      withPlatform((client) =>
        insertDocumentContentVersion(client, baseInput({ templateKey, locale, contentHtml: "<p>race-a</p>" }))
      ),
      withPlatform((client) =>
        insertDocumentContentVersion(client, baseInput({ templateKey, locale, contentHtml: "<p>race-b</p>" }))
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    // Either both happened to fully serialize (both fulfilled, sequential
    // version numbers) or one lost the race — both outcomes are correct,
    // what must NEVER happen is two is_current=true rows surviving.
    expect(fulfilled.length + rejected.length).toBe(2);
    if (rejected.length > 0) {
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    }

    const currentRows = await withPlatform((client) => listDocumentContentVersions(client, templateKey, locale));
    const currentCount = currentRows.filter((r) => r.is_current).length;
    expect(currentCount).toBe(1);
  });
});

describe("listDocumentContentVersions", () => {
  it("orders by version_number descending and respects a cursor", async () => {
    const templateKey = `qa-db-history-${uniqueSuffix()}`;
    const locale = "en";
    for (let i = 1; i <= 3; i++) {
      await withPlatform((client) =>
        insertDocumentContentVersion(client, baseInput({ templateKey, locale, contentHtml: `<p>v${i}</p>` }))
      );
    }

    const all = await withPlatform((client) => listDocumentContentVersions(client, templateKey, locale));
    expect(all.map((r) => r.version_number)).toEqual([3, 2, 1]);

    const afterCursor = await withPlatform((client) =>
      listDocumentContentVersions(client, templateKey, locale, { cursor: 3 })
    );
    expect(afterCursor.map((r) => r.version_number)).toEqual([2, 1]);
  });
});

describe("getDocumentContentVersionById", () => {
  it("returns null for a nonexistent id", async () => {
    const result = await withPlatform((client) =>
      getDocumentContentVersionById(client, "00000000-0000-0000-0000-000000000000")
    );
    expect(result).toBeNull();
  });
});
