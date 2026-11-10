import { describe, it, expect } from "vitest";
import { withTenant, getUsersPaginated } from "../db.js";

// Integration test (real tenant DB): the admin users list must load whichever
// column it is sorted by. Sorting by Status used to build ORDER BY i."status",
// but status lives on users, not identities, so the whole list failed to load.
const TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "neosleep";

describe("getUsersPaginated sort columns", () => {
  for (const sortBy of ["first_name", "last_name", "email", "status", "created_at"]) {
    for (const sortOrder of ["asc", "desc"] as const) {
      it(`sorts by ${sortBy} ${sortOrder}`, async () => {
        await withTenant(TENANT_SLUG, async (client) => {
          const { rows, total } = await getUsersPaginated(client, {}, 1, 10, sortBy, sortOrder);
          expect(rows.length).toBeLessThanOrEqual(total);
        });
      });
    }
  }
});
