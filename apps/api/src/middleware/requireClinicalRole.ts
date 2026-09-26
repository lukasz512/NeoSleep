import { requireRole } from "./requireRole.js";

/**
 * Patient health data — clinical questionnaires, sleep studies (AHI, SpO2,
 * results), generated clinical PDFs and uploaded studies — is readable and
 * writable only by treating clinicians and admins (Łukasz, 2026-09-25),
 * never by the commercial field force (rep / KAM / MSL), even inside their
 * own territory. GDPR Art.9 / LFPDPPP sensitive data.
 *
 * requireClinicalRole still guards the Documents tab list.
 */
export const requireClinicalRole = requireRole("admin", "doctor");

/**
 * The patient's studies (Estudios tab, sleep studies, /sleep-studies view):
 * managers can also read and edit them (Łukasz, 2026-09-26, NEO-83).
 * Hard deletes stay admin-only on their own routes.
 */
export const requireStudyRole = requireRole("admin", "doctor", "manager");
