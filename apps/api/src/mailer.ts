import nodemailer from "nodemailer";

const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_APP_PASSWORD;
const gmailTo = process.env.GMAIL_TO ?? gmailUser;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

  const html = `
    <div style="font-family:sans-serif;max-width:560px">
      <h2 style="margin-bottom:16px">${escapeHtml(subject)}</h2>
      <table style="border-collapse:collapse;width:100%">${tableRows}</table>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"NeoSleep" <${gmailUser}>`,
      to: gmailTo,
      subject,
      html,
    });
    console.log(`[mailer] Sent: ${subject}`);
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
    throw err;
  }
}

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  if (!transporter || !gmailUser) {
    console.warn("[mailer] Gmail not configured – set GMAIL_USER, GMAIL_APP_PASSWORD in .env");
    return;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:560px">
      <h2 style="margin-bottom:16px">Reset your password</h2>
      <p>Click the link below to reset your NeoSleep password. This link expires in 1 hour.</p>
      <p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>
      <p>If you didn't request this, you can ignore this email.</p>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"NeoSleep" <${gmailUser}>`,
      to,
      subject: "Reset your NeoSleep password",
      html,
    });
    console.log(`[mailer] Sent password reset email to ${to}`);
  } catch (err) {
    console.error("[mailer] Failed to send password reset email:", err);
    throw err;
  }
}
