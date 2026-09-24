import { requireRole } from "./requireRole.js";

/**
 * Patient health data — clinical questionnaires, sleep studies (AHI, SpO2,
 * results), generated clinical PDFs and uploaded studies — is readable and
 * writable only by treating clinicians and admins (Łukasz, 2026-09-25),
 * never by the commercial field force (rep / KAM / MSL / manager), even
 * inside their own territory. GDPR Art.9 / LFPDPPP sensitive data.
 */
export const requireClinicalRole = requireRole("admin", "doctor");
