import { describe, it, expect } from "vitest";
import { withPlatform } from "./tenant.js";
import { getEntityTypesForTemplate, setEntityTypesForTemplate, getTemplateKeysForEntityType } from "./documentTemplateEntityType.js";

/**
 * platform.document_template_entity_type is NOT tenant-isolated (platform
 * schema, cross-tenant — see the migration's own comment), same reasoning
 * as db/documentContent.spec.ts's own note: fully-synthetic, per-test-run-
 * unique template_keys, no shared-table pollution risk.
 */
function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const USER_ID = "00000000-0000-0000-0000-000000000000";

describe("getEntityTypesForTemplate / setEntityTypesForTemplate", () => {
  it("returns an empty array for a template with no assignment yet", async () => {
    const result = await withPlatform((client) =>
      getEntityTypesForTemplate(client, `qa-db-entity-type-nonexistent-${uniqueSuffix()}`)
    );
    expect(result).toEqual([]);
  });

  it("round-trips an assignment", async () => {
    const templateKey = `qa-db-entity-type-fixture-${uniqueSuffix()}`;
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKey, ["practitioner", "organization"], USER_ID));

    const result = await withPlatform((client) => getEntityTypesForTemplate(client, templateKey));
    expect(result.sort()).toEqual(["organization", "practitioner"]);
  });

  it("a second call fully replaces the first (delete-then-insert, not additive)", async () => {
    const templateKey = `qa-db-entity-type-replace-${uniqueSuffix()}`;
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKey, ["practitioner", "organization"], USER_ID));
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKey, ["patient"], USER_ID));

    const result = await withPlatform((client) => getEntityTypesForTemplate(client, templateKey));
    expect(result).toEqual(["patient"]);
  });

  it("an empty array clears any prior assignment", async () => {
    const templateKey = `qa-db-entity-type-clear-${uniqueSuffix()}`;
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKey, ["lead"], USER_ID));
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKey, [], USER_ID));

    const result = await withPlatform((client) => getEntityTypesForTemplate(client, templateKey));
    expect(result).toEqual([]);
  });
});

describe("getTemplateKeysForEntityType", () => {
  it("returns every template_key currently assigned to the given entity type", async () => {
    const entityType = "organization";
    const templateKeyA = `qa-db-entity-type-reverse-a-${uniqueSuffix()}`;
    const templateKeyB = `qa-db-entity-type-reverse-b-${uniqueSuffix()}`;
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKeyA, [entityType], USER_ID));
    await withPlatform((client) => setEntityTypesForTemplate(client, templateKeyB, [entityType, "patient"], USER_ID));

    const result = await withPlatform((client) => getTemplateKeysForEntityType(client, entityType));
    expect(result).toEqual(expect.arrayContaining([templateKeyA, templateKeyB]));
  });
});
