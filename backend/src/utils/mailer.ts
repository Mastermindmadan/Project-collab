import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const isPlaceholder = (val?: string) => {
  if (!val) return true;
  const lower = val.toLowerCase();
  return lower.includes('your-email') || lower.includes('your-app-password') || lower.includes('your-domain') || lower.includes('example.com');
};

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);

const smtpConfigured =
  !!smtpUser && !!smtpPass && !!smtpHost && !isPlaceholder(smtpUser) && !isPlaceholder(smtpPass);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort, // env vars are strings — coerce to integer
      // Port 465 => implicit SSL (secure:true). Port 587 (Gmail default) => STARTTLS:
      // secure must be false, and requireTLS enforces the upgrade instead of
      // silently falling back to an unencrypted connection.
      secure: smtpPort === 465,
      requireTLS: smtpPort !== 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null;

export class SmtpNotConfiguredError extends Error {
  constructor(message = 'SMTP_NOT_CONFIGURED') {
    super(message);
    this.name = 'SmtpNotConfiguredError';
  }
}

export function isSmtpConfigured(): boolean {
  return smtpConfigured;
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    throw new SmtpNotConfiguredError('SMTP server or credentials are not configured.');
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'ProjectCollab AI <no-reply@projectcollab.ai>',
      to,
      subject,
      html,
    });
    console.log('[MAILER] Message sent:', info.messageId);
  } catch (err: any) {
    console.error('[MAILER] Email delivery failed:', err.message);
    throw new SmtpNotConfiguredError(`Email delivery failed: ${err.message}`);
  }
}

