import { describe, it, expect } from "vitest";
import { withPlatform } from "../db/tenant.js";
import { getCurrentDocumentContentVersion, insertDocumentContentVersion } from "../db/documentContent.js";
import { ensureDocumentContent } from "./documentContentFixture.js";

/**
 * NEO-184: a spec that needs consent text must never replace the text real
 * patients sign. Uses a throwaway template key so it never touches real rows.
 */
const templateKey = () => `qa-ensure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("ensureDocumentContent", () => {
  it("leaves an existing current version untouched", async () => {
    const key = templateKey();
    const real = await withPlatform((client) =>
      insertDocumentContentVersion(client, {
        templateKey: key,
        locale: "mx",
        contentHtml: "<p>Real consent text.</p>",
        createdByUserId: "00000000-0000-0000-0000-000000000000",
        createdByName: "Admin",
        createdByEmail: "admin@neosleepcare.com",
        createdByTenantSlug: "test",
      })
    );

    const returned = await ensureDocumentContent(key, "mx", { contentHtml: "<p>QA consent body.</p>", changeNote: "spec" });

    expect(returned.id).toBe(real.id);
    const current = await withPlatform((client) => getCurrentDocumentContentVersion(client, key, "mx"));
    expect(current).toMatchObject({ id: real.id, content_html: "<p>Real consent text.</p>", version_number: 1 });
  }, 15000);

  it("seeds a first version when the template has none", async () => {
    const key = templateKey();
    const seeded = await ensureDocumentContent(key, "mx", { contentHtml: "<p>QA consent body.</p>", changeNote: "spec" });
    expect(seeded).toMatchObject({ content_html: "<p>QA consent body.</p>", version_number: 1, is_current: true });
  }, 15000);
});
