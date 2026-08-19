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

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  attachments: EmailAttachment[];
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
      from: `NeoSleep <${RESEND_FROM_EMAIL}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
      attachments: args.attachments,
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

export async function sendPartnerInviteEmail(to: string, registerLink: string, recipient: EmailRecipient): Promise<void> {
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
  });
}
