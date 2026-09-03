import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser } from "../db.js";
import type { TenantContext } from "../context/TenantContext.js";
import { CreatePatientCommand } from "./patient.js";
import { CreateNoteCommand, DeleteNoteCommand } from "./note.js";
import { GetNotesForEntityQuery } from "../queries/note.js";
import { ValidationError, ForbiddenError, NotFoundError } from "../errors.js";

// Command-level integration test — hits the real tenant DB via withTenant(),
// per CLAUDE.md's "No mock-only tests for the API server" rule. Needs a running
// Postgres with this tenant's migrations applied (pnpm start / docker compose).
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function buildTestContext(
  client: Parameters<typeof CreatePatientCommand>[0]["client"],
  role: "admin" | "rep" = "admin"
): Promise<TenantContext> {
  const email = `qa-note-cmd-${uniqueSuffix()}@neosleepcare.com`;
  const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
  const user = await insertStaffUser(client, email, "QA", "Pilot", role, hash, false);
  return {
    slug: TENANT_SLUG,
    client,
    user: { id: user!.id, email, role, roles: [{ role, scope: "global" }] },
    requestId: `test-${uniqueSuffix()}`,
  };
}

async function createTestPatient(ctx: TenantContext) {
  return CreatePatientCommand(ctx, {
    first_name: "Test",
    last_name: `Patient-${uniqueSuffix()}`,
  });
}

describe("CreateNoteCommand / GetNotesForEntityQuery / DeleteNoteCommand", () => {
  it("rejects an unknown entity_type", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(
        CreateNoteCommand(ctx, { entity_type: "spaceship", entity_id: "00000000-0000-0000-0000-000000000000", body: "hi" })
      ).rejects.toThrow(ValidationError);
    });
  });

  it("creates a note authored by the calling user and returns it with a resolved author_name", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);

      const note = await CreateNoteCommand(ctx, {
        entity_type: "patient",
        entity_id: patient.id,
        body: "Called the patient to confirm shipping address.",
      });

      expect(note.author_id).toBe(ctx.user.id);
      expect(note.author_name).toBe("QA Pilot");

      const notes = await GetNotesForEntityQuery(ctx, "patient", patient.id);
      expect(notes.map((n) => n.id)).toContain(note.id);
    });
  });

  it("lets the author delete their own note", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      const patient = await createTestPatient(ctx);
      const note = await CreateNoteCommand(ctx, { entity_type: "patient", entity_id: patient.id, body: "temp" });

      await DeleteNoteCommand(ctx, note.id);

      const notes = await GetNotesForEntityQuery(ctx, "patient", patient.id);
      expect(notes.map((n) => n.id)).not.toContain(note.id);
    });
  });

  it("forbids a non-author, non-admin user from deleting someone else's note", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const authorCtx = await buildTestContext(client, "admin");
      const patient = await createTestPatient(authorCtx);
      const note = await CreateNoteCommand(authorCtx, { entity_type: "patient", entity_id: patient.id, body: "temp" });

      const otherCtx = await buildTestContext(client, "rep");
      await expect(DeleteNoteCommand(otherCtx, note.id)).rejects.toThrow(ForbiddenError);
    });
  });

  it("throws NotFoundError when deleting a note that doesn't exist", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const ctx = await buildTestContext(client);
      await expect(DeleteNoteCommand(ctx, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(NotFoundError);
    });
  });
});
