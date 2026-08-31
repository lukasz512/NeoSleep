import { Resend } from "resend";
import {
  renderEmailLayout,
  escapeHtml,
  formatGreetingName,
  getEmailAttachments,
  getSocialsForRegion,
  emailT,
  type EmailAttachment,
} from "@neo/email";
import { RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_NOTIFY_TO } from "./env.js";

/** Every personalized email needs at least these to build a proper "Hi {title} {name}," greeting,
 * and region to pick the right social links (see @neo/email's config/emailSocials.ts). */
export interface EmailRecipient {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  language?: string | null;
  region?: string | null;
}

/** The rep/admin a personal-outreach email is "from" — e.g. a lead-offer or partner-invite
 * email should look like it came from the rep who actually triggered it, not a faceless
 * "NeoSleep" system sender. Resend's verified sending address stays the same either way (it
 * has to, for SPF/DKIM/DMARC alignment — see ADR-016 on why that's a dedicated subdomain, not
 * a per-person mailbox); what changes is the display name and the Reply-To header, so a doctor
 * hitting "reply" lands in the rep's own real inbox (e.g. alfred.jan@neosleepcare.com on
 * Microsoft 365), not a noreply@ black hole. This needs no new mailbox to be provisioned per
 * rep — it reuses whatever real address the rep already logs in with. */
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
  /** Overrides the "NeoSleep" display name — e.g. the rep's own name for personal outreach. */
  fromName?: string;
  /** Set so replies land in a real inbox (the rep's) instead of the noreply@ sending address. */
  replyTo?: string;
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
async function sendEmail(logLabel: string, args: SendEmailArgs): Promise<void> {
  if (!resend || !RESEND_FROM_EMAIL) {
    console.warn(`[mailer] Resend not configured – set RESEND_API_KEY, RESEND_FROM_EMAIL in .env`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: `${args.fromName ?? "NeoSleep"} <${RESEND_FROM_EMAIL}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    });
    if (error) {
      throw new Error(`${error.name}: ${error.message}`);
    }
    console.log(`[mailer] Sent ${logLabel} to ${args.to}`);
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
    fromName: sender.name,
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

export async function sendPartnerInviteEmail(
  to: string,
  registerLink: string,
  recipient: EmailRecipient,
  sender: EmailSender
): Promise<void> {
  const locale = recipient.language;
  const greetingName = formatGreetingName(recipient, to);

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:bold;color:#128F83;text-align:center;">${escapeHtml(emailT(locale, "email.partnerInvite.title"))}</h1>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.greeting", { name: greetingName }))}</p>
    <p style="margin:0 0 16px;">${escapeHtml(emailT(locale, "email.partnerInvite.body"))}</p>
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
    fromName: sender.name,
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
    fromName: sender.name,
    replyTo: sender.email,
  });
}
