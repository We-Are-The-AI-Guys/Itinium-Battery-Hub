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
    console.log("=== EMAIL (no SMTP configured — dev mode) ===");
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    const linkMatch = html.match(/href="([^"]+)"/);
    if (linkMatch) console.log(`Link: ${linkMatch[1]}`);
    console.log("=============================================");
    return;
  }

  await transporter.sendMail({ from, to, subject, html });
}

export function buildPasswordResetEmail(resetUrl: string, fullName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Inter, Arial, sans-serif; background: #f8fafc; padding: 40px 0; margin: 0;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #0a1628, #132744); padding: 32px 40px;">
      <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">Itinium Battery Portal</h1>
    </div>
    <div style="padding: 40px;">
      <h2 style="color: #0f2744; margin: 0 0 16px; font-size: 18px;">Reset your password</h2>
      <p style="color: #475569; margin: 0 0 8px;">Hi ${fullName},</p>
      <p style="color: #475569; margin: 0 0 24px;">We received a request to reset your password. Click the button below to create a new password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${resetUrl}" style="display: inline-block; background: #0f2744; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Reset Password</a>
      <p style="color: #94a3b8; margin: 24px 0 0; font-size: 13px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
      <p style="color: #94a3b8; margin: 8px 0 0; font-size: 12px;">Or copy this link: <a href="${resetUrl}" style="color: #0ea5e9;">${resetUrl}</a></p>
    </div>
  </div>
</body>
</html>`;
}
