import { requireRole } from "./requireRole.js";

/**
 * Patient health data — clinical questionnaires, sleep studies (AHI, SpO2,
 * results), generated clinical PDFs, uploaded studies and the Documents tab —
 * is readable and writable only by admins, treating clinicians and managers
 * (Łukasz, 2026-09-25; managers added 2026-09-26, NEO-83), never by the
 * commercial field force (rep / KAM / MSL), even inside their own territory.
 * GDPR Art.9 / LFPDPPP sensitive data. Hard deletes stay admin-only on their
 * own routes.
 */
export const requireStudyRole = requireRole("admin", "doctor", "manager");
