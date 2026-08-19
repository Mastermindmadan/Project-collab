// Node >= 18 provides a global fetch implementation — no dependency needed.
// const/global fetch typing comes from @types/node.

// Environment variables for the email provider
const EMAIL_API_URL = process.env.EMAIL_API_URL; // e.g., https://api.resend.com/emails
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM; // e.g., "no-reply@projectcollab.ai"
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'ProjectCollab AI';

export class EmailProviderNotConfiguredError extends Error {
  constructor(message = 'EMAIL_PROVIDER_NOT_CONFIGURED') {
    super(message);
    this.name = 'EmailProviderNotConfiguredError';
  }
}

/**
 * Sends a password‑reset OTP email via a generic HTTP email provider.
 * The function expects the provider to accept a POST request with JSON
 * containing `from`, `to`, `subject`, and `html` fields, and the API key
 * supplied via an `Authorization: Bearer <key>` header.
 */
export async function sendPasswordResetEmail(to: string, name: string, otp: string) {
  if (!EMAIL_API_URL || !EMAIL_API_KEY || !EMAIL_FROM) {
    throw new EmailProviderNotConfiguredError('Missing email provider configuration');
  }

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

  const payload = {
    from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
    to,
    subject,
    html,
  };

  const response = await fetch(EMAIL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${EMAIL_API_KEY}`,
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
