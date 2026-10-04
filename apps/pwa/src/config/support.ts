/**
 * Where "report incident" CTAs (e.g. a partner integration being down) send
 * a mailto: — same inbox as the backend's own RESEND_NOTIFY_TO. Interim,
 * manual reporting; proper backend-side incident capture + automation is
 * tracked as a follow-up, not built yet.
 *
 * NeoSleep-specific: moves to tenant config (app_config) with the client
 * brand split in CORE-86.
 */
export const SUPPORT_EMAIL = "neosleepcare@gmail.com";
