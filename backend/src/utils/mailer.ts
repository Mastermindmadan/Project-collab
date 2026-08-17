import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const smtpConfigured =
  !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.SMTP_HOST;

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super('SMTP_NOT_CONFIGURED');
    this.name = 'SmtpNotConfiguredError';
  }
}

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    // Critical: never pretend the email was delivered. Callers (e.g. the
    // password-reset flow) must surface a failure so the UI does NOT report a
    // false "OTP sent" success when no mail actually left the server.
    throw new SmtpNotConfiguredError();
  }
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'ProjectCollab AI <no-reply@projectcollab.ai>',
    to,
    subject,
    html,
  });
  console.log('[MAILER] Message sent:', info.messageId);
}
