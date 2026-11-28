import { describe, it, expect } from "vitest";
import bcrypt from "bcrypt";
import { withTenant, insertStaffUser, updateUser } from "../db.js";
import { getIdentityLanguage } from "./notification.js";

// Integration test (real tenant DB) for CORE-261: the territory sets a new
// staff user's region and language, both stay editable, and the notification
// path reads the same value mail does.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function identityOf(client: import("pg").PoolClient, userId: string) {
  const r = await client.query<{ id: string; region: string | null; language: string }>(
    `SELECT i.id, i.region, i.language FROM identities i JOIN users u ON u.identity_id = i.id WHERE u.id = $1`,
    [userId],
  );
  return r.rows[0];
}

describe("identity language comes from the territory and stays editable", () => {
  it("a user created in a Mexico territory gets region MX and language mx", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const territory = await client.query<{ id: string }>(`SELECT id FROM territory WHERE kind = 'country' AND country_code = 'MX' LIMIT 1`);
      expect(territory.rows.length).toBe(1);
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(
        client, `qa-lang-mx-${uniqueSuffix()}@neosleepcare.com`, "QA", "Mexico", "manager", hash, false,
        null, null, territory.rows[0].id,
      );
      const identity = await identityOf(client, user!.id);
      expect(identity.region).toBe("MX");
      expect(identity.language).toBe("mx");
      expect(await getIdentityLanguage(client, identity.id)).toBe("mx");
    });
  });

  it("editing region and language on the user changes what notifications and mail resolve", async () => {
    await withTenant(TENANT_SLUG, async (client) => {
      const hash = await bcrypt.hash("irrelevant-not-logged-in-with", 4);
      const user = await insertStaffUser(client, `qa-lang-edit-${uniqueSuffix()}@neosleepcare.com`, "QA", "Edit", "admin", hash, false);
      const before = await identityOf(client, user!.id);

      await updateUser(client, user!.id, { region: "pl", language: "pl" });
      const after = await identityOf(client, user!.id);
      expect(after.region).toBe("PL");
      expect(after.language).toBe("pl");
      expect(await getIdentityLanguage(client, before.id)).toBe("pl");

      // Language alone leaves the region untouched; an explicit language beats it.
      await updateUser(client, user!.id, { language: "mx" });
      const again = await identityOf(client, user!.id);
      expect(again.region).toBe("PL");
      expect(await getIdentityLanguage(client, before.id)).toBe("mx");
    });
  });
});
