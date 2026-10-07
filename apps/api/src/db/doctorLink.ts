import type { PoolClient } from "pg";
import { DatabaseError } from "../errors.js";

/**
 * A doctor's login (users) and their practitioner record must share one
 * identity (ADR-014): the access policy finds "my patients" through it
 * (queries/entityAccess.ts). CORE-173: a split pair locked Dra. Lorena out of
 * every screen, so the invite flows check the link before they commit.
 */
export async function isUserLinkedToPractitioner(
  client: PoolClient,
  userId: string,
  practitionerId: string
): Promise<boolean> {
  try {
    const { rows } = await client.query<{ linked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM users u JOIN practitioner p ON p.identity_id = u.identity_id
          WHERE u.id = $1 AND p.id = $2
       ) AS linked`,
      [userId, practitionerId]
    );
    return rows[0]?.linked ?? false;
  } catch (err) {
    throw new DatabaseError("isUserLinkedToPractitioner", err);
  }
}
