import type { PoolClient } from "pg";
import { AppError, DatabaseError } from "../errors.js";
import { documentT, type DocumentFooterOptions } from "@neo/documents";
import { formatDisplayName, formatOptionalDisplayName } from "../utils/personName.js";

export interface PatientPdfContext {
  patient_name: string;
  /** First name only — all the public self-fill page may show (data minimisation: the link could be scanned by someone else). */
  patient_first_name: string;
  /** "YYYY-MM-DD" (read as text: a DATE parsed into a JS Date can shift a day across time zones) — print with formatBirthDate(). */
  patient_birth_date: string | null;
  practitioner_name: string | null;
  organization_name: string | null;
  /** The clinic's own contact email — where a patient exercises their data rights (the clinic is the controller). */
  organization_email: string | null;
  /** Street + city and phone — the issuer line in the PDF footer (document system, 2026-09-26: the clinic, not NeoSleep). */
  organization_address: string | null;
  organization_phone: string | null;
}

/**
 * Patient + treating doctor + clinic names for pre-filling generated PDFs
 * and the patient self-fill page's greeting. db/patient.ts joins
 * practitioner+identities for practitioner_name but not organization for
 * the clinic name, hence this separate query.
 *
 * Every printed patient form must name a doctor: when the patient has no
 * linked doctor, `fallbackUserId` (whoever prints, or whoever sent the
 * self-fill link) stands in — if that user is a doctor (their users row
 * shares its identity with a practitioner row, ADR-014). Otherwise the
 * doctor line stays blank, to be filled in by hand.
 */
export async function getPatientPdfContext(
  client: PoolClient,
  patientId: string,
  fallbackUserId: string | null = null
): Promise<PatientPdfContext | null> {
  try {
    const result = await client.query<{
      patient_salutation: string | null;
      patient_first_name: string;
      patient_last_name: string;
      patient_birth_date: string | null;
      practitioner_salutation: string | null;
      practitioner_first_name: string | null;
      practitioner_last_name: string | null;
      organization_name: string | null;
      organization_email: string | null;
      organization_address_line1: string | null;
      organization_city: string | null;
      organization_phone: string | null;
    }>(
      `SELECT
         pi.title AS patient_salutation, pi.first_name AS patient_first_name, pi.last_name AS patient_last_name,
         to_char(pi.date_of_birth, 'YYYY-MM-DD') AS patient_birth_date,
         pri.title AS practitioner_salutation, pri.first_name AS practitioner_first_name, pri.last_name AS practitioner_last_name,
         o.name AS organization_name, o.email AS organization_email,
         o.address_line1 AS organization_address_line1, o.city AS organization_city, o.phone AS organization_phone
       FROM patient p
       JOIN identities pi ON p.identity_id = pi.id
       LEFT JOIN practitioner pr ON pr.id = COALESCE(
         p.practitioner_id,
         (SELECT fp.id FROM users fu
            JOIN practitioner fp ON fp.identity_id = fu.identity_id AND fp.deleted_at IS NULL
          WHERE fu.id = $2
          LIMIT 1)
       )
       LEFT JOIN identities pri ON pr.identity_id = pri.id
       LEFT JOIN organization o ON pr.organization_id = o.id
       WHERE p.id = $1 AND p.deleted_at IS NULL`,
      [patientId, fallbackUserId]
    );
    const row = result.rows[0];
    if (!row) return null;

    return {
      patient_first_name: row.patient_first_name,
      patient_birth_date: row.patient_birth_date,
      patient_name: formatDisplayName({
        salutation: row.patient_salutation,
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
      }),
      practitioner_name: formatOptionalDisplayName({
        salutation: row.practitioner_salutation,
        first_name: row.practitioner_first_name,
        last_name: row.practitioner_last_name,
      }),
      organization_name: row.organization_name,
      organization_email: row.organization_email,
      organization_address: [row.organization_address_line1, row.organization_city].filter(Boolean).join(", ") || null,
      organization_phone: row.organization_phone,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new DatabaseError("getPatientPdfContext", err);
  }
}

/** Birth date as printed on forms: dd/mm/yyyy (dd.mm.yyyy for Polish); empty when unknown so the line stays blank to fill by hand. */
export function formatBirthDate(isoDate: string | null, locale: string): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return locale === "pl" ? `${day}.${month}.${year}` : `${day}/${month}/${year}`;
}

/**
 * Per-page footer for a patient document (document system, 2026-09-26):
 * the patient's name + date of birth on every page, and the treating
 * clinic as the issuer — NeoSleep only as a trailing mark.
 */
export function patientDocumentFooter(context: PatientPdfContext, locale: string): DocumentFooterOptions {
  const birthDate = formatBirthDate(context.patient_birth_date, locale);
  return {
    subject: birthDate ? `${context.patient_name} · ${documentT(locale, "documents.common.birthDateShort")} ${birthDate}` : context.patient_name,
    issuer: [context.organization_name, context.organization_address, context.organization_phone, context.organization_email, "NeoSleep"].filter(
      (part): part is string => !!part
    ),
  };
}
