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

export async function sendMail(to: string, subject: string, html: string) {
  if (!transporter) {
    // Log the email content to console so developers can see it without real SMTP
    console.warn('[MAILER] SMTP not configured. Email would have been sent to:', to);
    console.warn('[MAILER] Subject:', subject);
    return; // Silently skip – do not throw
  }
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'ProjectCollab AI <no-reply@projectcollab.ai>',
    to,
    subject,
    html,
  });
  console.log('[MAILER] Message sent:', info.messageId);
}
