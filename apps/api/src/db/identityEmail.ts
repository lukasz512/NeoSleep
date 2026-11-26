import type { PoolClient } from "pg";
import { EmailInUseError } from "../errors.js";

/**
 * NEO-111: users, doctors and leads keep one identity per email (the partial
 * unique index identities_email_unique_not_shared, migration 037); patients
 * are exempt (email_shared). Checked before the INSERT/UPDATE so a taken email
 * becomes a 409 EMAIL_IN_USE the form shows on its Email field, instead of an
 * opaque 23505 "Database error". `ownIdentityId` skips the row being edited.
 */
export async function assertEmailNotTaken(
  client: PoolClient,
  email: string | null | undefined,
  ownIdentityId: string | null
): Promise<void> {
  if (!email) return;
  const conflict = await client.query<{ id: string }>(
    `SELECT id FROM identities WHERE email = $1 AND NOT email_shared AND ($2::uuid IS NULL OR id != $2) LIMIT 1`,
    [email, ownIdentityId]
  );
  if (conflict.rows[0]) throw new EmailInUseError(email);
}

/**
 * NEO-126: is this patient's email also on another identity (a family's shared
 * inbox, a doctor, a user)? Every patient row carries email_shared = true (it
 * means "may share"), so the flag alone can't tell — this looks for an actual
 * second holder. The signed-copy email is only offered to an address that is
 * the patient's alone: health data sent to a relative is a reportable breach.
 */
export async function isPatientEmailHeldByAnother(client: PoolClient, patientId: string, email: string): Promise<boolean> {
  const { rows } = await client.query<{ shared: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM identities other
       WHERE lower(other.email) = lower($2)
         AND other.id != (SELECT identity_id FROM patient WHERE id = $1)
     ) AS shared`,
    [patientId, email]
  );
  return rows[0]?.shared ?? true;
}
