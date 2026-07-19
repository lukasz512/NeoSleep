import nodemailer from "nodemailer";
import { renderEmailLayout, escapeHtml, formatGreetingName, getEmailAttachments, getSocialsForRegion, emailT } from "@neo/email";

/** Every personalized email needs at least these to build a proper "Hi {title} {name}," greeting,
 * and region to pick the right social links (see @neo/email's config/emailSocials.ts). */
export interface EmailRecipient {
  title?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  language?: string | null;
  region?: string | null;
}

const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_APP_PASSWORD;
const gmailTo = process.env.GMAIL_TO ?? gmailUser;

const transporter =
  gmailUser && gmailPass
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      })
    : null;

export async function sendContactEmail(subject: string, rows: [string, string][]): Promise<void> {
  if (!transporter || !gmailTo || !gmailUser) {
    console.warn("[mailer] Gmail not configured – set GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_TO in .env");
    return;
  }

  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;font-weight:600;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join("");

  // Internal notification (always to the fixed GMAIL_TO admin inbox), so this stays unlocalized —
  // unlike the user-facing password reset email below, there's no per-recipient language to pick.
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

  try {
    await transporter.sendMail({
      from: `"NeoSleep" <${gmailUser}>`,
      to: gmailTo,
      subject,
      html,
      attachments: getEmailAttachments(socials),
    });
    console.log(`[mailer] Sent: ${subject}`);
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
    throw err;
  }
}

export async function sendPasswordResetEmail(to: string, resetLink: string, recipient: EmailRecipient): Promise<void> {
  if (!transporter || !gmailUser) {
    console.warn("[mailer] Gmail not configured – set GMAIL_USER, GMAIL_APP_PASSWORD in .env");
    return;
  }

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

  try {
    await transporter.sendMail({
      from: `"NeoSleep" <${gmailUser}>`,
      to,
      subject: emailT(locale, "email.passwordReset.subject"),
      html,
      attachments: getEmailAttachments(socials),
    });
    console.log(`[mailer] Sent password reset email to ${to}`);
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err);
    throw err;
  }
}
