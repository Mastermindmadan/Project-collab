// Node >= 18 provides a global fetch implementation — no external dependency needed.
import { sendMail } from '../utils/mailer';

// SMTP credentials (SMTP_HOST/SMTP_USER/SMTP_PASS) are the PRIMARY delivery path —
// the same credentials ops already have configured in .env / render.yaml.
// The HTTP API provider vars are an OPTIONAL fallback.
export class EmailProviderNotConfiguredError extends Error {
  constructor(message = 'EMAIL_PROVIDER_NOT_CONFIGURED') {
    super(message);
    this.name = 'EmailProviderNotConfiguredError';
  }
}

// Reads lazily each call so edits to the env are honored and we never cache unset values.
const getHttpConfig = () => ({
  url: process.env.EMAIL_API_URL, // e.g., https://api.resend.com/emails
  key: process.env.EMAIL_API_KEY,
  from: process.env.EMAIL_FROM, // e.g., "no-reply@example.com"
  fromName: process.env.EMAIL_FROM_NAME || 'ProjectCollab AI',
});

const httpConfigured = () => {
  const { url, key, from } = getHttpConfig();
  return !!url && !!key && !!from;
};

/**
 * Sends a password-reset OTP email.
 *
 * Delivery strategy (in order):
 *   1. SMTP (SMTP_HOST / SMTP_USER / SMTP_PASS) via nodemailer — the PRIMARY path.
 *      SMTP_FROM is used as the sender; falls back to no-reply otherwise.
 *   2. Generic HTTP API provider (EMAIL_API_URL / EMAIL_API_KEY / EMAIL_FROM) — fallback.
 *
 * The generic HTTP provider expects a POST with JSON `from`, `to`, `subject`, `html`
 * and the API key supplied via an `Authorization: Bearer <key>` header
 * (e.g. https://api.resend.com/emails).
 */
export async function sendPasswordResetEmail(to: string, name: string, otp: string) {
  const subject = 'ProjectCollab Password Reset OTP';
  const html = `
    <html>
      <body style="font-family:Arial,Helvetica,sans-serif;">
        <h2>ProjectCollab AI Password Reset Code</h2>
        <p>Hi ${name || 'there'},</p>
        <p>Use the following one‑time code to reset your password:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0;">${otp}</p>
        <p>This code expires in 10 minutes and can be used only once.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
        <hr/>
        <p style="font-size:0.9em;color:#555;">For your security: never share this code with anyone. The ProjectCollab AI team will never ask for it.</p>
        <p style="font-size:0.9em;color:#555;">- The ProjectCollab AI Team</p>
      </body>
    </html>
  `;

  // PRIMARY path — SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS). This is what ops configures
  // in .env / render.yaml, so it must be used first when present.
  const smtpReady =
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
  if (smtpReady) {
    try {
      await sendMail(to, subject, html);
      return true;
    } catch (err: any) {
      // Don't silently swallow a real SMTP failure — surface it and let the
      // caller decide (the controller falls back to logging the OTP in dev).
      console.error(`[EMAIL SERVICE] SMTP delivery failed for ${to}: ${err.message}`);
      if (httpConfigured()) {
        // fall through to the HTTP API provider below
      } else {
        throw err;
      }
    }
  }

  // FALLBACK path — generic HTTP email provider (e.g. Resend).
  const http = getHttpConfig();
  if (!http.url || !http.key || !http.from) {
    throw new EmailProviderNotConfiguredError(
      'No email provider configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS (SMPT) or EMAIL_API_URL/EMAIL_API_KEY/EMAIL_FROM (HTTP API).'
    );
  }

  const payload = {
    from: `${http.fromName} <${http.from}>`,
    to,
    subject,
    html,
  };

  const response = await fetch(http.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${http.key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[EMAIL SERVICE] Failed to send email:', response.status, errorBody);
    throw new Error(`Email provider error: ${response.status}`);
  }

  const result = await response.json();
  console.log('[EMAIL SERVICE] Email sent:', result);
  return true;
}
