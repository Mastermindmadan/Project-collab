import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const isPlaceholder = (val?: string) => {
  if (!val) return true;
  const lower = val.toLowerCase().trim();
  return lower.includes('your-email') || lower.includes('your-app-password') || lower.includes('your-domain') || lower.includes('example.com');
};

export class SmtpNotConfiguredError extends Error {
  constructor(message = 'SMTP_NOT_CONFIGURED') {
    super(message);
    this.name = 'SmtpNotConfiguredError';
  }
}

export function isSmtpConfigured(): boolean {
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  return (
    !!smtpUser &&
    !!smtpPass &&
    !!smtpHost &&
    !isPlaceholder(smtpUser) &&
    !isPlaceholder(smtpPass)
  );
}

/**
 * Dynamically creates a Nodemailer transporter using current environment variables.
 * Reading env vars lazily at call time ensures runtime environment updates are honored.
 */
function getTransporter() {
  if (!isSmtpConfigured()) return null;

  const smtpHost = process.env.SMTP_HOST!.trim();
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER!.trim();
  const smtpPass = process.env.SMTP_PASS!.trim();
  const isSecure = smtpPort === 465;

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: isSecure,
    // For non-465 ports (e.g. 587), STARTTLS is initiated automatically by Nodemailer.
    // Allow overriding TLS rejection if self-signed certs are used in dev.
    tls: {
      rejectUnauthorized: process.env.SMTP_IGNORE_TLS === 'true' ? false : true,
    },
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });
}

export async function sendMail(to: string, subject: string, html: string) {
  const transporter = getTransporter();
  if (!transporter) {
    console.error('[MAILER ERROR] SMTP credentials missing or invalid in environment');
    throw new SmtpNotConfiguredError('SMTP server or credentials are not configured.');
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const smtpUser = process.env.SMTP_USER?.trim();
  const fromAddress = process.env.SMTP_FROM?.trim() || smtpUser || 'no-reply@projectcollab.ai';

  console.log('[MAILER LOG] Attempting sendMail with runtime config:', {
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_USER: smtpUser,
    FROM_ADDRESS: fromAddress,
    TO: to,
    secure: smtpPort === 465,
  });

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
    });
    console.log('[MAILER SUCCESS] Message sent successfully:', {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
    return info;
  } catch (err: any) {
    // Log complete Nodemailer error properties for deep diagnosis
    console.error('[MAILER ERROR] Email delivery failed:', {
      message: err.message,
      code: err.code,
      command: err.command,
      responseCode: err.responseCode,
      response: err.response,
      stack: err.stack,
    });
    throw new SmtpNotConfiguredError(`Email delivery failed [${err.code || 'UNKNOWN'}]: ${err.message}`);
  }
}

