import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, getGlobalTerritoryId } from "../db.js";
import { getAuditLogForEntities } from "../db/audit-log.js";
import type { TenantContext } from "../context/TenantContext.js";
import { SaveDocumentContentVersionCommand, sanitizeDocumentContentHtml } from "./documentContent.js";
import { ValidationError } from "../errors.js";

/**
 * Uses the "__test" manifest entry (packages/documents/src/documentManifest.ts)
 * rather than a real document key: platform.document_content_version is
 * NOT tenant-isolated the way DEFAULT_TENANT_SLUG=test protects the rest of
 * this integration-test DB (it's a platform-schema, cross-tenant table —
 * see the migration's own comment) — a test that saved into, say,
 * "informedConsent"/"en" would flip is_current on a row real PDF generation
 * could read from in this same dev environment. The "__test" entry exists
 * specifically so this test suite can exercise the real
 * SaveDocumentContentVersionCommand path (manifest validation included)
 * without that risk; it's marked hidden so it never appears in the real
 * admin picker (see GetDocumentContentIndexQuery).
 */
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "test";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(client: Parameters<typeof insertStaffUser>[0]): Promise<TenantContext> {
  const email = `qa-doc-content-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", "admin", hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, name: "QA Pilot", role: "admin", roles: [{ role: "admin", territory_id: await getGlobalTerritoryId(client) }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

describe("sanitizeDocumentContentHtml", () => {
  it("strips a <script> tag entirely", () => {
    const out = sanitizeDocumentContentHtml('<p>hello</p><script>alert("x")</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(");
    expect(out).toContain("hello");
  });

  it(
    "an unterminated HTML comment drops everything after it rather than letting it leak through as " +
      "live markup — the real (verified directly) sanitize-html behavior: an HTML5 parser treats an " +
      "unclosed <!-- as running to end-of-document, so its whole tail (including any injection " +
      "attempt) is discarded as comment content, never re-emitted as text or markup. This is the " +
      "actual safety property that closes the bug class hit once already this session on a static " +
      "template (an unbalanced comment silently corrupting/exposing everything physically after it) — " +
      "content loss here is a known, safe trade-off, not the corrupting-leak this guards against.",
    () => {
      const out = sanitizeDocumentContentHtml("<p>before</p><!-- unbalanced <script>alert(1)</script><p>after</p>");
      expect(out).toBe("<p>before</p>");
      expect(out).not.toContain("script");
      expect(out).not.toContain("alert(");
    }
  );

  it("drops disallowed attributes (e.g. onclick) but keeps allowed tags/text", () => {
    const out = sanitizeDocumentContentHtml('<p onclick="doEvil()">safe text</p>');
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("doEvil");
    expect(out).toContain("safe text");
  });
});

describe("SaveDocumentContentVersionCommand", () => {
  it("rejects an empty templateKey", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        SaveDocumentContentVersionCommand(ctx, { templateKey: "", locale: "en", contentHtml: "<p>x</p>" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("rejects an unsupported locale", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        SaveDocumentContentVersionCommand(ctx, { templateKey: "__test", locale: "fr", contentHtml: "<p>x</p>" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("rejects a templateKey/locale combination not in the manifest", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      // "__test" only declares en/pl/mx — "informedConsent" is real but this
      // combination check itself is what's under test, so any genuinely
      // unregistered key works:
      await expect(
        SaveDocumentContentVersionCommand(ctx, {
          templateKey: `unknown-${uniqueSuffix()}`,
          locale: "en",
          contentHtml: "<p>x</p>",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("rejects content that sanitizes down to nothing", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        SaveDocumentContentVersionCommand(ctx, {
          templateKey: "__test",
          locale: "en",
          contentHtml: '<script>alert(1)</script><img src=x onerror="alert(2)">',
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("saves a sanitized version and writes an audit_log entry", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const version = await SaveDocumentContentVersionCommand(ctx, {
        templateKey: "__test",
        locale: "en",
        contentHtml: '<p>Hello <script>alert(1)</script>world</p>',
        changeNote: "QA test save",
      });

      expect(version.content_html).not.toContain("<script");
      expect(version.content_html).toContain("Hello");
      expect(version.content_html).toContain("world");
      expect(version.created_by_user_id).toBe(ctx.user.id);
      expect(version.created_by_tenant_slug).toBe(TENANT_SLUG);

      const auditRows = await getAuditLogForEntities(client, ["DocumentContentVersion"], [version.id]);
      expect(auditRows.length).toBeGreaterThan(0);
      expect(auditRows[0].action).toBe("update");
    });
  });
});
