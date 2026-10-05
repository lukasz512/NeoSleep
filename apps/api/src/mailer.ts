import { Resend, type WebhookEventPayload } from "resend";
import {
  renderEmailLayout,
  escapeHtml,
  formatGreetingName,
  getEmailAttachments,
  getEmailIconAttachments,
  emailIconCid,
  getSocialsForRegion,
  emailT,
  type EmailAttachment,
  type EmailIconName,
} from "@neo/email";
import { maskEmail } from "./utils/maskEmail.js";
import { AppError } from "./errors.js";
import { RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_NOTIFY_TO, PARTNER_DOCS_CC_EMAIL, RESEND_WEBHOOK_SECRET } from "./env.js";

/** Every personalized email needs at least these to build a proper "Hi {title} {name}," greeting,
 * and region to pick the right social links (see @neo/email's config/emailSocials.ts). */
export interface EmailRecipient {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  language?: string | null;
  region?: string | null;
}

/** The rep/admin a personal-outreach email is "from" — the display name always reads
 * "NeoSleep" (consistent brand sender across lead-offer, partner-invite, and thank-you
 * emails), but Reply-To is still set to the rep's own address, so a doctor hitting "reply"
 * lands in the rep's real inbox (e.g. alfred.jan@neosleepcare.com on Microsoft 365), not the
 * unmonitored sending address. This needs no new mailbox to be provisioned per rep — it reuses
 * whatever real address the rep already logs in with. */
export interface EmailSender {
  name: string;
  email: string;
}

/** Active-market region -> email locale (see CLAUDE.md's active markets). Falls back to English elsewhere. */
export function localeForRegion(region: string | null | undefined): string {
  const normalized = (region ?? "").trim().toUpperCase();
  if (normalized === "PL") return "pl";
  if (normalized === "MX") return "mx";
  return "en";
}

/** Intl.DateTimeFormat locale for each supported email language — used to format the demo-booking meeting time. */
const INTL_LOCALE: Record<string, string> = { pl: "pl-PL", mx: "es-MX", en: "en-US" };

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
  /** Set so replies land in a real inbox (the rep's) instead of the unmonitored sending address. */
  replyTo?: string;
  /** Fixed extra recipient(s), e.g. an internal compliance inbox — see PARTNER_DOCS_CC_EMAIL. */
  cc?: string | string[];
  /** Display name in From; defaults to "NeoSleep". Patient emails use "<clinic> | NeoSleep" (NEO-162). */
  fromName?: string;
  /** Resend tags, echoed back in its webhooks — how routes/webhooks.ts finds the tenant and the send-log row (NEO-190). */
  tags?: EmailTags;
}

/** Tags on patient emails: which tenant schema holds the send-log row, and what kind of email it was. */
export interface EmailTags {
  tenant: string;
  kind: string;
}


/** RFC 5322 display name: CR/LF and angle brackets stripped (header injection), always quoted so commas/dots in a clinic name are safe. */
function formatFrom(name: string, email: string): string {
  const clean = name.replace(/[\r\n<>]/g, " ").replace(/\s+/g, " ").trim() || "NeoSleep";
  return `"${clean.replace(/["\\]/g, "\\$&")}" <${email}>`;
}

/** "Clínica Dental Sonrisa | NeoSleep" — patients know their clinic, not the platform, so the clinic leads (NEO-162). */
export function clinicFromName(clinicName: string | null | undefined): string {
  const name = clinicName?.trim();
  return name ? `${name} | NeoSleep` : "NeoSleep";
}

/**
 * Shared send path for every email below — one place to hold the "is Resend
 * configured" guard and the success/error logging, instead of six copies of
 * the same three lines (see ADR-016). resend.emails.send() returns
 * { data, error } rather than throwing on API-level failures, so `error` is
 * checked explicitly and turned into a thrown Error either way — callers
 * (e.g. auth.ts's fire-and-forget forgot-password handler) already expect a
 * rejected promise on failure.
 */
async function sendEmail(logLabel: string, args: SendEmailArgs): Promise<string | null> {
  if (!resend || !RESEND_FROM_EMAIL) {
    console.warn(`[mailer] Resend not configured – set RESEND_API_KEY, RESEND_FROM_EMAIL in .env`);
    return null;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: formatFrom(args.fromName ?? "NeoSleep", RESEND_FROM_EMAIL),
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.cc ? { cc: args.cc } : {}),
      ...(args.tags ? { tags: [{ name: "tenant", value: args.tags.tenant }, { name: "kind", value: args.tags.kind }] } : {}),
    });
    if (error) {
      // Resend refused this recipient (a test domain like example.com, a
      // malformed or suppressed address): the address is the problem, not
      // the server — say so instead of a generic failure (NEO-202).
      if (error.name === "validation_error" && /`to`|\bto\b field|recipient/i.test(error.message)) {
        throw new EmailRejectedError(`${error.name}: ${error.message}`);
      }
      throw new Error(`${error.name}: ${error.message}`);
    }
    console.log(`[mailer] Sent ${logLabel} to ${maskEmail(args.to)}${data?.id ? ` (${data.id})` : ""}`);
    return data?.id ?? null;
  } catch (err) {
    console.error(`[mailer] Failed to send ${logLabel}:`, err);
    throw err;
  }
}

export async function sendContactEmail(subject: string, rows: [string, string][]): Promise<void> {
  if (!RESEND_NOTIFY_TO) {
    console.warn("[mailer] Resend not configured – set RESEND_NOTIFY_TO in .env");
    return;
  }

  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("");

  // Internal notification (always to the fixed RESEND_NOTIFY_TO admin inbox), so this stays
  // unlocalized — unlike the user-facing password reset email below, there's no per-recipient
  // language to pick.
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:19px;font-weight:bold;color:#128F83;">${escapeHtml(subject)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;font-size:15px;">${tableRows}</table>`;

  const socials = getSocialsForRegion(null);
  const html = renderEmailLayout({
    bodyHtml,
    footerTagline: "NeoSleep — internal notification",
    footerCities: emailT(null, "email.footer.cities"),
    footerCopyright: emailT(null, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(null, "email.footer.support"),
    socials,
  });

  await sendEmail("internal notification email", {
    to: RESEND_NOTIFY_TO,
    subject,
    html,
    attachments: getEmailAttachments(socials),
  });
}

export async function sendPasswordResetEmail(to: string, resetLink: string, recipient: EmailRecipient): Promise<void> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.passwordReset.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.passwordReset.body"))}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.passwordReset.expiry"))}</p>
    <p style="margin:0;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.passwordReset.ignore"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.passwordReset.title"),
    bodyHtml,
    cta: { text: emailT(locale, "email.passwordReset.cta"), href: resetLink },
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  await sendEmail("password reset email", {
    to,
    subject: emailT(locale, "email.passwordReset.subject"),
    html,
    attachments: getEmailAttachments(socials),
  });
}

/**
 * The patient's personal link to their open questionnaires — returns whether it was actually handed to Resend (docs/stories/
 * clinical-questionnaire-capture-redesign.md). Deliberately says nothing
 * clinical — no questionnaire names, no answers: an inbox is not a place
 * for health data. Replies go to the clinic, which is the data controller.
 */
export async function sendQuestionnaireLinkEmail(
  to: string,
  link: string,
  recipient: EmailRecipient,
  clinic: { name: string | null; email: string | null },
  count: number,
  tags?: EmailTags,
  validDays?: number
): Promise<string | null> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);
  const clinicName = clinic.name ?? emailT(locale, "email.questionnaireLink.yourClinic");

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.questionnaireLink.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, count === 1 ? "email.questionnaireLink.bodyOne" : "email.questionnaireLink.bodyMany", { clinic: clinicName, count: String(count) }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.questionnaireLink.howLong"))}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#7a827e;">${escapeHtml(validDays ? emailT(locale, "email.questionnaireLink.expiryDays", { days: String(validDays) }) : emailT(locale, "email.questionnaireLink.expiry"))}</p>
    <p style="margin:0;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.questionnaireLink.ignore"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.questionnaireLink.title"),
    bodyHtml,
    cta: { text: emailT(locale, "email.questionnaireLink.cta"), href: link },
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  // false when email isn't configured (sendEmail logs and skips) — the caller must tell the user, not claim it was sent.
  const id = await sendEmail("questionnaire link email", {
    to,
    subject: emailT(locale, "email.questionnaireLink.subject", { clinic: clinicName }),
    html,
    attachments: getEmailAttachments(socials),
    ...(clinic.email ? { replyTo: clinic.email } : {}),
    fromName: clinicFromName(clinic.name),
    ...(tags ? { tags } : {}),
  });
  return id;
}

export interface LeadOfferLinks {
  /** Plain link to the marketing page — no prefill, just "learn more". */
  offerLink: string;
  /** Same page with ?lead=<id> — auto-opens the booking modal prefilled with this lead's info. */
  bookingLink: string;
}

export async function sendLeadOfferEmail(
  to: string,
  links: LeadOfferLinks,
  recipient: EmailRecipient,
  sender: EmailSender
): Promise<void> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.leadOffer.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.leadOffer.thanks"))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.leadOffer.body"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.leadOffer.title"),
    bodyHtml,
    cta: { text: emailT(locale, "email.leadOffer.cta"), href: links.offerLink },
    secondaryCta: { text: emailT(locale, "email.leadOffer.ctaBookDemo"), href: links.bookingLink },
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  await sendEmail("lead offer email", {
    to,
    subject: emailT(locale, "email.leadOffer.subject"),
    html,
    attachments: getEmailAttachments(socials),
    replyTo: sender.email,
  });
}

export interface DemoBookingMeeting {
  /** ISO start time. */
  start: string;
  /** Google Meet join link — omitted from the email (no CTA button) on the rare chance the calendar event has none. */
  meetLink?: string;
}

export async function sendDemoBookingConfirmationEmail(to: string, meeting: DemoBookingMeeting, recipient: EmailRecipient): Promise<void> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);
  const intlLocale = INTL_LOCALE[locale ?? "en"] ?? INTL_LOCALE.en;
  const formattedDateTime = `${new Intl.DateTimeFormat(intlLocale, {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(meeting.start))} CET`;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.demoBooking.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.demoBooking.body"))}</p>
    <p style="margin:0 0 16px;font-size:17px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(formattedDateTime)}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.demoBooking.title"),
    bodyHtml,
    cta: meeting.meetLink ? { text: emailT(locale, "email.demoBooking.cta"), href: meeting.meetLink } : undefined,
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  await sendEmail("demo booking confirmation email", {
    to,
    subject: emailT(locale, "email.demoBooking.subject"),
    html,
    attachments: getEmailAttachments(socials),
  });
}

/**
 * Partner emails (invite, signed documents) open with a formal address line ("Dr First Last,"),
 * never the casual "Hi …," greeting and never the bare email address. Every partner is a doctor,
 * so a missing salutation on the record falls back to the locale's "Dr" rather than dropping it.
 */
function formatPartnerAddress(recipient: EmailRecipient, to: string): string {
  const locale = recipient.language;
  const hasName = !!(recipient.firstName?.trim() || recipient.lastName?.trim());
  const title = recipient.title?.trim() || (hasName ? emailT(locale, "email.partner.defaultTitle") : null);
  return emailT(locale, "email.partner.address", { name: formatGreetingName({ ...recipient, title }, to) });
}

export async function sendPartnerInviteEmail(
  to: string,
  registerLink: string,
  recipient: EmailRecipient,
  sender: EmailSender
): Promise<void> {
  const locale = recipient.language;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.partnerInvite.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(formatPartnerAddress(recipient, to))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.partnerInvite.body"))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.partnerInvite.deviceNote"))}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.partnerInvite.expiry"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.partnerInvite.title"),
    bodyHtml,
    cta: { text: emailT(locale, "email.partnerInvite.cta"), href: registerLink },
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  await sendEmail("partner invite email", {
    to,
    subject: emailT(locale, "email.partnerInvite.subject"),
    html,
    attachments: getEmailAttachments(socials),
    replyTo: sender.email,
  });
}

/**
 * Sent at InvitePractitionerCommand time (lead -> "Invite to Partner") — a
 * holding "thank you, more details soon" email. No registration link: the
 * actual set-password/register invite (sendPartnerInviteEmail) is deferred
 * to ActivatePractitionerCommand, once training/capacitation is finished.
 */
export async function sendPartnerJoinThankYouEmail(to: string, recipient: EmailRecipient, sender: EmailSender): Promise<void> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.partnerJoinThankYou.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.partnerJoinThankYou.body"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.partnerJoinThankYou.title"),
    bodyHtml,
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  await sendEmail("partner join thank-you email", {
    to,
    subject: emailT(locale, "email.partnerJoinThankYou.subject"),
    html,
    attachments: getEmailAttachments(socials),
    replyTo: sender.email,
  });
}

/**
 * NEO-126: the signed consent, emailed to the patient because they ticked
 * "send me a copy" before signing. Neutral on purpose (legal, 2026-09-28):
 * the subject and text name only the clinic and the date — no treatment, no
 * diagnosis; the document itself is the attachment. Replies go to the clinic,
 * the data controller. Returns whether it was handed to Resend.
 */
export async function sendPatientSignedCopyEmail(
  to: string,
  recipient: EmailRecipient,
  clinic: { name: string | null; email: string | null },
  document: { filename: string; content: Buffer },
  signedOn: string,
  tags?: EmailTags
): Promise<string | null> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);
  const clinicName = clinic.name ?? emailT(locale, "email.questionnaireLink.yourClinic");

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.signedCopy.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.signedCopy.body", { clinic: clinicName, date: signedOn }))}</p>
    <p style="margin:0;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.signedCopy.ignore"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.signedCopy.title"),
    bodyHtml,
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  const id = await sendEmail("signed copy email", {
    to,
    subject: emailT(locale, "email.signedCopy.subject", { clinic: clinicName }),
    html,
    attachments: [...getEmailAttachments(socials), { filename: document.filename, content: document.content }],
    ...(clinic.email ? { replyTo: clinic.email } : {}),
    fromName: clinicFromName(clinic.name),
    ...(tags ? { tags } : {}),
  });
  return id;
}

/**
 * booked / rescheduled / cancelled follow a staff action; ask (the 2-day /
 * day-before ask) and reminder come from the CORE-116 schedule; today is the
 * CORE-113 part 2 "Su cita es hoy" email, 2 hours before the visit.
 */
export type AppointmentEmailKind = "booked" | "rescheduled" | "cancelled" | "ask" | "reminder" | "today";

export interface AppointmentEmail {
  kind: AppointmentEmailKind;
  startAt: string;
  endAt: string;
  /** IANA zone of the clinic — times are shown as the clinic's local time. */
  timezone: string;
  clinicName: string | null;
  clinicAddress: string | null;
  /** The clinic's own maps link, else directions are searched by address. */
  clinicMapsUrl?: string | null;
  doctorName: string | null;
  onlineUrl: string | null;
  /** The clinic's “what to bring” text (organization.visit_instructions); left out when empty or cancelled. */
  visitInstructions?: string | null;
  /** CORE-113: the informed consent still to sign — a link, or null when the address is shared (signed at the clinic instead). Absent = nothing to sign. */
  consent?: { link: string | null } | null;
  /** CORE-116 P2: no buttons yet — the email says the patient will be asked to confirm 2 days before. */
  confirmLater?: boolean;
  /** Who to call or write to change the appointment (CORE-25: no self-service rescheduling yet). */
  contact: { phone: string | null; email: string | null };
  links: {
    /** null on a cancellation — nothing left to confirm. */
    confirm: string | null;
    cannotAttend: string | null;
    optOut: string;
    google: string | null;
    outlook: string | null;
  };
  ics: { content: string; method: "REQUEST" | "CANCEL" };
}

/** "Wednesday, January 15, 2031" + "09:00 – 10:00" in the clinic's zone and the patient's language. */
export function formatAppointmentWhen(startAt: string, endAt: string, timezone: string, locale: string | null | undefined): { date: string; time: string } {
  const intlLocale = INTL_LOCALE[locale ?? "en"] ?? INTL_LOCALE.en;
  const date = new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date(startAt));
  const clock = new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  return { date, time: `${clock.format(new Date(startAt))} – ${clock.format(new Date(endAt))}` };
}

/** The pieces of the calendar-page date tile: "OCT 2031", "15", "WEDNESDAY", plus the start time on its own. */
function dateTileParts(startAt: string, timezone: string, locale: string | null | undefined): { monthYear: string; day: string; weekday: string; start: string } {
  const intlLocale = INTL_LOCALE[locale ?? "en"] ?? INTL_LOCALE.en;
  const at = new Date(startAt);
  const part = (opts: Intl.DateTimeFormatOptions): string => new Intl.DateTimeFormat(intlLocale, { timeZone: timezone, ...opts }).format(at);
  return {
    monthYear: `${part({ month: "short" }).replace(".", "")} ${part({ year: "numeric" })}`.toUpperCase(),
    day: part({ day: "numeric" }),
    weekday: part({ weekday: "long" }).toUpperCase(),
    start: part({ hour: "2-digit", minute: "2-digit" }),
  };
}

/** "Cómo llegar": the clinic's own maps link if it set one, else a Google Maps search for the address. */
export function directionsUrl(mapsUrl: string | null | undefined, address: string | null): string | null {
  if (mapsUrl) return /^https?:\/\//i.test(mapsUrl) ? mapsUrl : `https://${mapsUrl}`;
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

const APPT = { teal: "#128F83", ink: "#1d2b29", muted: "#6b7a77", soft: "#eef7f5", line: "#dbe8e5" };

/** Status at a glance (calendar-r1 D3, layout A): colour + icon + one sentence. */
const APPOINTMENT_STATUS: Record<AppointmentEmailKind, { icon: EmailIconName; color: string; bg: string }> = {
  booked: { icon: "check", color: APPT.teal, bg: APPT.soft },
  rescheduled: { icon: "calendar", color: "#B26A00", bg: "#FFF4E0" },
  cancelled: { icon: "x", color: "#B3261E", bg: "#FDECEA" },
  ask: { icon: "calendar", color: APPT.teal, bg: APPT.soft },
  reminder: { icon: "check", color: APPT.teal, bg: APPT.soft },
  today: { icon: "check", color: APPT.teal, bg: APPT.soft },
};

const iconImg = (name: EmailIconName, size = 20): string =>
  `<img src="cid:${emailIconCid(name)}" width="${size}" height="${size}" alt="" style="display:block;border:0;width:${size}px;height:${size}px;">`;

/**
 * CORE-25 / CORE-26: the patient's appointment email — booked, moved or
 * cancelled. Organizational only (date, time, clinic, doctor, how to reach
 * the clinic); never notes, studies or treatment (ADR-027 §6). Layout A
 * (calendar-r1 D3): a status banner, a calendar-page date tile, icon rows,
 * "Confirm" / "I can't come", the clinic's own "what to bring" text and how
 * to reach the clinic. Carries the .ics invitation and a one-click stop
 * link; the clinic leads the sender name and receives replies.
 */
export async function sendAppointmentPatientEmail(to: string, recipient: EmailRecipient, appointment: AppointmentEmail, tags?: EmailTags): Promise<string | null> {
  const locale = recipient.language;
  const t = (key: string, params?: Record<string, string>): string => emailT(locale, `email.appointment.${key}`, params);
  const greetingName = formatGreetingName(recipient, to);
  const clinicName = appointment.clinicName ?? emailT(locale, "email.questionnaireLink.yourClinic");
  const { date } = formatAppointmentWhen(appointment.startAt, appointment.endAt, appointment.timezone, locale);
  const tile = dateTileParts(appointment.startAt, appointment.timezone, locale);
  const minutes = Math.round((new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000);
  const cancelled = appointment.kind === "cancelled";
  const status = APPOINTMENT_STATUS[appointment.kind];
  const strike = cancelled ? "text-decoration:line-through;" : "";
  const fade = cancelled ? "opacity:.5;" : "";
  const icons: EmailIconName[] = [status.icon, "pin", "person", "phone", "mail"];

  const banner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${status.bg};border-radius:12px;margin:0 0 18px;"><tr>
      <td width="44" valign="top" style="padding:14px 0 14px 16px;">${iconImg(status.icon, 28)}</td>
      <td style="padding:14px 16px 14px 10px;"><div style="font-size:19px;font-weight:bold;color:${status.color};">${escapeHtml(t(`${appointment.kind}.title`))}</div>
      <div style="font-size:14px;color:${APPT.ink};margin-top:2px;">${escapeHtml(t(`${appointment.kind}.banner`, { date }))}</div></td>
    </tr></table>`;

  const ticket = `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px;${fade}"><tr>
      <td valign="top"><table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${APPT.line};border-radius:10px;width:84px;text-align:center;border-collapse:separate;">
        <tr><td style="background:${cancelled ? APPT.muted : APPT.teal};color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;padding:4px 0;border-radius:9px 9px 0 0;">${escapeHtml(tile.monthYear)}</td></tr>
        <tr><td style="font-size:30px;font-weight:bold;color:${APPT.ink};padding:6px 0 0;${strike}">${escapeHtml(tile.day)}</td></tr>
        <tr><td style="font-size:11px;color:${APPT.muted};padding:0 0 6px;">${escapeHtml(tile.weekday)}</td></tr>
      </table></td>
      <td valign="middle" style="padding-left:16px;"><div style="font-size:26px;font-weight:bold;color:${APPT.ink};${strike}">${escapeHtml(tile.start)}</div>
      <div style="font-size:13px;color:${APPT.muted};">${escapeHtml(t("clinicTime"))} · ${escapeHtml(t("minutes", { n: String(minutes) }))}</div></td>
    </tr></table>`;

  const row = (icon: EmailIconName, label: string, valueHtml: string): string => `
      <tr><td width="34" valign="top" style="padding:10px 0;">${iconImg(icon)}</td>
      <td style="padding:10px 0;border-bottom:1px solid ${APPT.line};"><div style="font-size:12px;color:${APPT.muted};">${escapeHtml(label)}</div>${valueHtml}</td></tr>`;
  const directions = cancelled ? null : directionsUrl(appointment.clinicMapsUrl, appointment.clinicAddress);
  const whereHtml = `<div style="font-size:15px;font-weight:bold;color:${APPT.ink};">${escapeHtml(clinicName)}</div>${
    appointment.clinicAddress ? `<div style="font-size:13px;color:${APPT.ink};">${escapeHtml(appointment.clinicAddress)}</div>` : ""}${
    directions ? `<a href="${escapeHtml(directions)}" style="display:inline-block;margin-top:6px;font-size:13px;font-weight:bold;color:${APPT.teal};text-decoration:none;">${escapeHtml(t("directions"))} &rarr;</a>` : ""}`;
  const rows = [
    row("pin", t("where"), whereHtml),
    ...(appointment.onlineUrl && !cancelled ? [row("pin", t("online"), `<a href="${escapeHtml(appointment.onlineUrl)}" style="font-size:15px;font-weight:bold;color:${APPT.teal};">${escapeHtml(t("joinOnline"))}</a>`)] : []),
    ...(appointment.doctorName ? [row("person", t("withWhom"), `<div style="font-size:15px;font-weight:bold;color:${APPT.ink};">${escapeHtml(appointment.doctorName)}</div>`)] : []),
  ].join("");

  const bodyHtml = `
    ${banner}
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}<br>${escapeHtml(t(`${appointment.kind}.body`, { clinic: clinicName }))}</p>
    ${ticket}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;font-size:15px;${fade}">${rows}</table>
    ${appointment.links.confirm ? `<p style="margin:18px 0 0;font-size:15px;font-weight:bold;">${escapeHtml(t("question"))}</p>` : ""}
    ${!cancelled && appointment.confirmLater ? `<p style="margin:14px 0 0;font-size:14px;color:${APPT.ink};">${escapeHtml(t("confirmLater"))}</p>` : ""}`;

  const instructions = !cancelled && appointment.visitInstructions?.trim()
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${APPT.line};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:14px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top">${iconImg("list")}</td>
      <td style="padding-left:10px;"><div style="font-size:14px;font-weight:bold;color:${APPT.ink};margin-bottom:4px;">${escapeHtml(t("prepareTitle"))}</div>
      <div style="font-size:14px;color:${APPT.ink};line-height:1.5;">${escapeHtml(appointment.visitInstructions.trim()).replace(/\r?\n/g, "<br>")}</div></td></tr></table>
    </td></tr></table>`
    : "";
  if (instructions) icons.push("list");

  const consentHtml = !cancelled && appointment.consent
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${APPT.teal};border-radius:14px;margin:0 0 14px;"><tr><td style="padding:16px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top">${iconImg("doc", 26)}</td>
      <td style="padding-left:10px;"><div style="font-size:16px;font-weight:bold;color:${APPT.ink};">${escapeHtml(t("consent.title"))}</div>
      <div style="font-size:14px;color:${APPT.ink};margin-top:4px;line-height:1.45;">${escapeHtml(t(appointment.consent.link ? "consent.body" : "consent.atClinic"))}</div></td></tr></table>
      ${appointment.consent.link ? `<a href="${escapeHtml(appointment.consent.link)}" style="display:block;margin-top:12px;padding:12px 18px;border-radius:999px;background:${APPT.teal};color:#ffffff;font-size:15px;font-weight:bold;text-align:center;text-decoration:none;">${escapeHtml(t("consent.cta"))}</a>
      <div style="font-size:12.5px;color:${APPT.muted};text-align:center;margin-top:8px;">${escapeHtml(t("consent.hint"))}</div>` : ""}
    </td></tr></table>`
    : "";
  if (consentHtml) icons.push("doc");

  const { phone, email } = appointment.contact;
  const contactRows = [
    ...(phone ? [`<tr><td style="padding:3px 0;">${iconImg("phone", 18)}</td><td style="padding:3px 0 3px 8px;"><a href="tel:${escapeHtml(phone.replace(/[^0-9+]/g, ""))}" style="font-size:15px;font-weight:bold;color:${APPT.teal};text-decoration:none;white-space:nowrap;">${escapeHtml(phone)}</a></td></tr>`] : []),
    ...(email ? [`<tr><td style="padding:3px 0;">${iconImg("mail", 18)}</td><td style="padding:3px 0 3px 8px;"><a href="mailto:${escapeHtml(email)}" style="font-size:15px;font-weight:bold;color:${APPT.teal};text-decoration:none;">${escapeHtml(email)}</a></td></tr>`] : []),
  ];
  const contactHtml = contactRows.length
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${APPT.soft};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:14px 16px;">
      <div style="font-size:14px;font-weight:bold;color:${APPT.ink};margin-bottom:8px;">${escapeHtml(t(cancelled ? "contactCancelled" : "contactToChange", { clinic: clinicName }))}</div>
      <table role="presentation" cellpadding="0" cellspacing="0">${contactRows.join("")}</table>
    </td></tr></table>`
    : "";

  // CORE-116 P3: calendar as a visible box — Google / Outlook buttons, and the attached .ics for Apple, Samsung and the rest.
  const calButton = (href: string, label: string): string =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:4px 4px 0 0;padding:9px 14px;border-radius:999px;border:1px solid ${APPT.teal};color:${APPT.teal};font-size:13.5px;font-weight:bold;text-decoration:none;">${escapeHtml(label)}</a>`;
  const calendarButtons = [
    ...(appointment.links.google ? [calButton(appointment.links.google, "Google Calendar")] : []),
    ...(appointment.links.outlook ? [calButton(appointment.links.outlook, "Outlook")] : []),
  ];
  const calendarHtml = !cancelled && calendarButtons.length
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${APPT.line};border-radius:12px;margin:0 0 14px;"><tr><td style="padding:14px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="top">${iconImg("calendar")}</td>
      <td style="padding-left:10px;"><div style="font-size:14px;font-weight:bold;color:${APPT.ink};">${escapeHtml(t("calendar.title"))}</div>
      <div style="font-size:13px;color:${APPT.muted};margin-top:2px;">${escapeHtml(t("calendar.attachmentHint"))}</div></td></tr></table>
      <div style="margin-top:8px;">${calendarButtons.join("")}</div>
    </td></tr></table>`
    : "";
  if (calendarHtml && !icons.includes("calendar")) icons.push("calendar");

  // Under the buttons: the answer hint, the clinic's own text, how to reach the clinic, calendar links, the stop link.
  const afterCtaHtml = `
    ${appointment.links.confirm ? `<p style="margin:0 0 16px;font-size:12.5px;color:${APPT.muted};text-align:center;">${escapeHtml(t("tapHint"))}</p>` : ""}
    ${consentHtml}
    ${instructions}
    ${calendarHtml}
    ${contactHtml}
    <p style="margin:0;font-size:12px;color:#7a827e;text-align:center;">${escapeHtml(t("optOutLead"))} <a href="${escapeHtml(appointment.links.optOut)}" style="color:#7a827e;">${escapeHtml(t("optOut"))}</a></p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: `${t(`${appointment.kind}.title`)} · ${date}`,
    bodyHtml,
    cta: appointment.links.confirm ? { text: t("confirm"), href: appointment.links.confirm } : undefined,
    secondaryCta: appointment.links.cannotAttend ? { text: t("cannotAttend"), href: appointment.links.cannotAttend } : undefined,
    afterCtaHtml,
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  return sendEmail(`appointment ${appointment.kind} email`, {
    to,
    subject: t(`${appointment.kind}.subject`, { clinic: clinicName, date }),
    html,
    attachments: [
      ...getEmailAttachments(socials),
      ...getEmailIconAttachments(icons),
      {
        filename: cancelled ? "cancelled.ics" : "appointment.ics",
        content: Buffer.from(appointment.ics.content, "utf8"),
        contentType: `text/calendar; charset=utf-8; method=${appointment.ics.method}`,
      },
    ],
    ...(email ? { replyTo: email } : {}),
    fromName: clinicFromName(appointment.clinicName),
    ...(tags ? { tags } : {}),
  });
}

/** One signed document ready to attach — plain PDF bytes, not yet an EmailAttachment
 * (no inline contentId, unlike the logo/social icons the layout also attaches). */
export interface SignedDocumentAttachment {
  filename: string;
  content: Buffer;
}

/**
 * Sent right after AcceptPractitionerInviteCommand's transaction commits (never from inside
 * it — a failure here must not roll back a signature that already succeeded). NeoSleep's copy
 * goes to `ccEmail` — the jurisdiction's signatory config (NEO-51: PL → lukasz.ostrowski@,
 * MX → alfred.jan@) — falling back to the older single PARTNER_DOCS_CC_EMAIL env var.
 * Returns Resend's message id (null when email isn't configured) for the evidence trail.
 */
export async function sendSignedDocumentsEmail(
  to: string,
  recipient: EmailRecipient,
  documents: SignedDocumentAttachment[],
  loginLink: string,
  ccEmail?: string | null
): Promise<string | null> {
  const locale = recipient.language;

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.signedDocuments.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(formatPartnerAddress(recipient, to))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.signedDocuments.body"))}</p>`;

  const socials = getSocialsForRegion(recipient.region);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.signedDocuments.title"),
    bodyHtml,
    cta: { text: emailT(locale, "email.signedDocuments.cta"), href: loginLink },
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });

  const cc = ccEmail || PARTNER_DOCS_CC_EMAIL;
  return sendEmail("signed documents email", {
    to,
    subject: emailT(locale, "email.signedDocuments.subject"),
    html,
    attachments: [...getEmailAttachments(socials), ...documents.map((d) => ({ filename: d.filename, content: d.content }))],
    ...(cc ? { cc } : {}),
  });
}

export class ResendWebhookNotConfiguredError extends Error {}

/** The mail provider refused the recipient address — 422 EMAIL_REJECTED, shown as "check the address". */
export class EmailRejectedError extends AppError {
  constructor(detail: string) {
    super("The mail server rejected this email address", "EMAIL_REJECTED", 422, detail);
  }
}

/**
 * Checks a Resend webhook's signature (Svix / Standard Webhooks: svix-id,
 * svix-timestamp, svix-signature over the raw body) and returns the parsed
 * event. Throws on a bad or stale signature — the caller answers 400.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string | null = RESEND_WEBHOOK_SECRET ?? null
): WebhookEventPayload {
  if (!secret) throw new ResendWebhookNotConfiguredError("RESEND_WEBHOOK_SECRET is not set");
  // verify() makes no API call, so any client works — even without RESEND_API_KEY.
  const client = resend ?? new Resend("re_verify_only");
  return client.webhooks.verify({ payload: rawBody, headers, webhookSecret: secret });
}

/**
 * NEO-192 (D4): the doctor's own confirmation that an email went to a
 * patient — short name, masked address, document count, time. It carries
 * no link to the patient's documents, so the doctor's inbox never holds a
 * way into the patient's forms.
 */
export async function sendEmailSentConfirmation(
  to: string,
  info: { patient: string; sentTo: string; count: number; clinic: string | null; language: string }
): Promise<void> {
  const locale = info.language;
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.sendConfirmation.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.sendConfirmation.body", { patient: info.patient, email: info.sentTo, count: String(info.count), date: when }))}</p>
    <p style="margin:0;font-size:13px;color:#7a827e;">${escapeHtml(emailT(locale, "email.sendConfirmation.noLink"))}</p>`;
  const socials = getSocialsForRegion(null);
  const html = renderEmailLayout({
    preheader: emailT(locale, "email.sendConfirmation.title"),
    bodyHtml,
    footerTagline: emailT(locale, "email.footer.tagline"),
    footerCities: emailT(locale, "email.footer.cities"),
    footerCopyright: emailT(locale, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(locale, "email.footer.support"),
    socials,
  });
  await sendEmail("send confirmation email", {
    to,
    subject: emailT(locale, "email.sendConfirmation.subject", { patient: info.patient }),
    html,
    attachments: getEmailAttachments(socials),
    fromName: clinicFromName(info.clinic),
  });
}

export interface ReconciliationAlert {
  status: "mismatch" | "failed";
  /** "dev" / "prod" / "local" — whose orders were compared. */
  environment: string;
  matched: number;
  mismatches: number;
  oursSent: number;
  labTotal: number;
  /** One line per order that needs attention: reason + lab order number. No patient data. */
  lines: string[];
  error: string | null;
  /** Absolute link to the admin panel. */
  panelUrl: string;
}

/**
 * Device-order reconciliation alert (NEO-218, Łukasz Q1): sent to admins only
 * when a run finds a mismatch or can't read the lab — a clean run sends
 * nothing. Internal notification like sendContactEmail, so unlocalized; it
 * carries counts, reason codes and lab order numbers only, never patient
 * names (the details stay behind the admin panel's login).
 */
export async function sendDeviceOrderReconciliationAlert(to: string, alert: ReconciliationAlert): Promise<void> {
  const env = alert.environment.toUpperCase();
  const subject =
    alert.status === "failed"
      ? `[NeoSleep ${env}] Device order check failed`
      : `[NeoSleep ${env}] ${alert.mismatches} device order(s) need attention`;
  const rows: [string, string][] = [
    ["Environment", alert.environment],
    ["Result", alert.status === "failed" ? `could not read the lab: ${alert.error ?? "unknown error"}` : "mismatch"],
    ["Matched", `${alert.matched} of ${alert.matched + alert.mismatches}`],
    ["Sent from NeoSleep", String(alert.oursSent)],
    ["Listed by the lab", String(alert.labTotal)],
  ];
  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("");
  const list =
    alert.lines.length > 0
      ? `<ul style="margin:12px 0;padding-left:20px;font-size:15px;">${alert.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
      : "";
  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:19px;font-weight:bold;color:#128F83;">${escapeHtml(subject)}</h1>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;font-size:15px;">${tableRows}</table>
    ${list}
    <p style="margin:16px 0 0;font-size:15px;"><a href="${escapeHtml(alert.panelUrl)}" style="color:#128F83;">Open the admin panel</a> for the details.</p>`;

  const socials = getSocialsForRegion(null);
  const html = renderEmailLayout({
    bodyHtml,
    footerTagline: "NeoSleep — internal notification",
    footerCities: emailT(null, "email.footer.cities"),
    footerCopyright: emailT(null, "email.footer.copyright", { year: String(new Date().getFullYear()) }),
    supportLeadIn: emailT(null, "email.footer.support"),
    socials,
  });

  await sendEmail("device order reconciliation alert", { to, subject, html, attachments: getEmailAttachments(socials) });
}
