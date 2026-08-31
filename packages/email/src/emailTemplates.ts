import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SocialLink } from "./config/emailSocials.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Provider-agnostic inline attachment — content read eagerly as a Buffer (no `path`/streaming,
 * since these are the same handful of small local assets every time). `contentId` is what the
 * HTML references via `cid:${contentId}`; matches Resend's Node SDK attachment shape directly so
 * mailer.ts can pass these straight through with no transform. */
export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentId: string;
}

/** `diskFilename` must match the real file under assets/email/ — `displayFilename` is just the name
 * the recipient's mail client shows and can differ (kept distinct so a typo in one can't silently
 * break the other, the way LOGO_ATTACHMENT's did before this fix). */
function assetAttachment(diskFilename: string, displayFilename: string, contentId: string): EmailAttachment {
  // One level above src/ (and, identically, above dist/ once built) — see packages/email/assets/email/.
  const filePath = path.join(__dirname, "../assets/email", diskFilename);
  return {
    filename: displayFilename,
    content: fs.readFileSync(filePath),
    contentId,
  };
}

/** Referenced from HTML via `cid:${LOGO_CID}` — an inline attachment, not a base64 data URI, so the
 * template source stays readable and the logo still renders in clients that block remote images. */
export const LOGO_CID = "neosleep-logo";
export const LOGO_ATTACHMENT = assetAttachment("logo.png", "neosleep-logo.png", LOGO_CID);

function socialCid(id: string): string {
  return `neosleep-social-${id}`;
}

/** Inline-image attachments for the given (already region-resolved) social set — pass as `attachments`
 * on the resend.emails.send() call alongside these socials, so the cid: references in the footer
 * always resolve. */
export function getEmailAttachments(socials: SocialLink[]): EmailAttachment[] {
  return [LOGO_ATTACHMENT, ...socials.map((s) => assetAttachment(s.file, s.file, socialCid(s.id)))];
}

const BRAND = {
  primary: "#128F83",
  charcoal: "#4a4a49",
  bg: "#f4f5f4",
  footerBg: "#e8f3ef",
  footerText: "#5f6b66",
};

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Title + first + last name, skipping any that are missing — falls back to the email if none are set. */
export function formatGreetingName(
  parts: { title?: string | null; firstName?: string | null; lastName?: string | null },
  fallback: string
): string {
  const name = [parts.title, parts.firstName, parts.lastName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ");
  return name || fallback;
}

/** Technical support contact shown in small print at the bottom of every branded email. */
const SUPPORT_CONTACT_EMAIL = "lukasz.ostrowski@neosleepcare.com";

export interface EmailLayoutOptions {
  /** Hidden preview text shown next to the subject in inbox lists — not rendered in the body. */
  preheader?: string;
  /** Pre-built inner HTML (already escaped where needed) — heading, paragraphs, tables, etc. */
  bodyHtml: string;
  cta?: { text: string; href: string };
  /** Rendered below `cta`, same button style but with an outlined/lighter look — for a second action (e.g. "View the offer" + "Book a demo"). Ignored if `cta` isn't set. */
  secondaryCta?: { text: string; href: string };
  footerTagline: string;
  footerCities: string;
  footerCopyright: string;
  /** e.g. "Having trouble? Contact our technical department:" — the support email is appended automatically. */
  supportLeadIn: string;
  /** Already resolved for the recipient's region — see config/emailSocials.ts. */
  socials: SocialLink[];
}

function renderFooter(footerTagline: string, footerCities: string, footerCopyright: string, supportLeadIn: string, socials: SocialLink[]): string {
  const socialLinks = socials.map(
    (s) => `<td style="padding:0 5px;"><a href="${escapeHtml(s.href)}" target="_blank"><img src="cid:${socialCid(s.id)}" width="36" height="36" alt="${escapeHtml(s.label)}" style="display:block;border:0;"></a></td>`
  ).join("");

  return `
  <tr><td style="background:${BRAND.footerBg};padding:28px 32px 20px;font-family:Arial,Helvetica,sans-serif;text-align:center;">
    <img src="cid:${LOGO_CID}" width="140" alt="NeoSleep" style="display:block;border:0;width:140px;max-width:140px;height:auto;margin:0 auto 12px;">
    <div style="font-size:13px;color:${BRAND.footerText};margin-bottom:16px;">${escapeHtml(footerTagline)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px;"><tr>${socialLinks}</tr></table>
    <div style="font-size:15px;color:${BRAND.charcoal};margin-bottom:6px;">${escapeHtml(footerCities)}</div>
    <div style="font-size:13px;color:${BRAND.footerText};margin-bottom:16px;">${escapeHtml(footerCopyright)}</div>
    <div style="border-top:1px solid #d4e4e0;padding-top:14px;font-size:12px;color:${BRAND.footerText};">
      ${escapeHtml(supportLeadIn)} <a href="mailto:${SUPPORT_CONTACT_EMAIL}" style="color:${BRAND.footerText};">${SUPPORT_CONTACT_EMAIL}</a>
    </div>
  </td></tr>`;
}

/**
 * Shared branded shell (rounded white card, teal accent, logo, footer) for all outbound emails —
 * mirrors the layout of the marketing template the team already sent successfully, so recipients
 * see a consistent look across transactional and campaign mail. Table-based layout + MSO conditional
 * comments around the CTA button are deliberate: Outlook desktop ignores border-radius/padding on
 * <a> and needs the VML roundrect fallback to render a pill-shaped button at all.
 */
/** Solid teal for the primary action, outlined/transparent for a secondary one below it — mirrors the site's home-btn--white-outline / home-btn--white-border pairing. */
function renderCtaButton(cta: { text: string; href: string }, variant: "primary" | "secondary"): string {
  const isPrimary = variant === "primary";
  const fill = isPrimary ? BRAND.primary : "transparent";
  const textColor = isPrimary ? "#ffffff" : BRAND.primary;
  const border = isPrimary ? "" : `border:2px solid ${BRAND.primary};`;
  return `
    <!--[if mso]>
    <v:roundrect href="${escapeHtml(cta.href)}" style="height:50px;v-text-anchor:middle;width:280px;" arcsize="50%" stroke="${isPrimary ? "f" : "t"}" strokecolor="${BRAND.primary}" fillcolor="${fill}" xmlns:v="urn:schemas-microsoft-com:vml">
      <center style="color:${textColor};font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${escapeHtml(cta.text)}</center>
    </v:roundrect>
    <![endif]-->
    <!--[if !mso]><!-- -->
    <a href="${escapeHtml(cta.href)}" target="_blank" style="background:${fill};color:${textColor};display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;line-height:${isPrimary ? "50px" : "46px"};text-align:center;text-decoration:none;width:280px;border-radius:9999px;${border}">${escapeHtml(cta.text)}</a>
    <!--<![endif]-->`;
}

export function renderEmailLayout({ preheader, bodyHtml, cta, secondaryCta, footerTagline, footerCities, footerCopyright, supportLeadIn, socials }: EmailLayoutOptions): string {
  const ctaHtml = cta
    ? `
  <tr><td align="center" style="padding:8px 32px 28px;">
    ${renderCtaButton(cta, "primary")}
    ${secondaryCta ? `<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>${renderCtaButton(secondaryCta, "secondary")}` : ""}
  </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>NeoSleep</title>
<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
  <tr><td style="background:${BRAND.primary};height:6px;line-height:6px;font-size:6px;">&nbsp;</td></tr>
  <tr><td align="center" style="padding:28px 32px 8px;">
    <img src="cid:${LOGO_CID}" width="190" alt="NeoSleep" style="display:block;border:0;outline:none;width:190px;max-width:190px;height:auto;margin:0 auto;">
  </td></tr>
  <tr><td style="padding:16px 32px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.charcoal};">
    ${bodyHtml}
  </td></tr>${ctaHtml}${renderFooter(footerTagline, footerCities, footerCopyright, supportLeadIn, socials)}
</table>
</td></tr>
</table>
</body>
</html>`;
}
