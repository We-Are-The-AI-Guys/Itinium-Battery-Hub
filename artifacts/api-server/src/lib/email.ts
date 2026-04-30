import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const from = process.env.SMTP_FROM || "noreply@itinium.co.uk";
  const transporter = createTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV !== "production") {
      console.log("=== EMAIL (no SMTP configured — dev mode) ===");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      const linkMatch = html.match(/href="([^"]+)"/);
      if (linkMatch) console.log(`Link: ${linkMatch[1]}`);
      console.log("=============================================");
    } else {
      console.warn(`[email] SMTP not configured — email to ${to} was NOT sent.`);
    }
    return;
  }

  await transporter.sendMail({ from, to, subject, html });
}

export function buildBrandedEmail(title: string, bodyHtml: string, footerNote?: string): string {
  const footer = footerNote
    ? `<p style="color: #94a3b8; margin: 24px 0 0; font-size: 12px;">${footerNote}</p>`
    : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background: #f8fafc; padding: 40px 0; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #0a1628, #0f2744); padding: 28px 40px; border-bottom: 3px solid #0ea5e9;">
      <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">Itinium Battery Portal</h1>
    </div>
    <div style="padding: 36px 40px;">
      <h2 style="color: #0f2744; margin: 0 0 20px; font-size: 17px; font-weight: 600;">${title}</h2>
      ${bodyHtml}
      ${footer}
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 40px; text-align: center;">
      <p style="color: #94a3b8; margin: 0; font-size: 11px;">© ${new Date().getFullYear()} Itinium Battery Portal. This is an automated notification.</p>
    </div>
  </div>
</body>
</html>`;
}

export function buildPasswordResetEmail(resetUrl: string, fullName: string): string {
  return buildBrandedEmail(
    "Reset your password",
    `<p style="color: #475569; margin: 0 0 8px;">Hi ${fullName},</p>
    <p style="color: #475569; margin: 0 0 24px;">We received a request to reset your password. Click the button below to create a new password. This link expires in <strong>1 hour</strong>.</p>
    <a href="${resetUrl}" style="display: inline-block; background: #0f2744; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Reset Password</a>`,
    `If you didn't request this, you can safely ignore this email. Your password won't change. Or copy this link: <a href="${resetUrl}" style="color: #0ea5e9;">${resetUrl}</a>`
  );
}
