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
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured. Cannot send email.');
    }
    console.warn('[MAILER] SMTP not configured. Email would have been sent to:', to);
    console.warn('[MAILER] Subject:', subject);
    return;
  }
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'ProjectCollab AI <no-reply@projectcollab.ai>',
    to,
    subject,
    html,
  });
  console.log('[MAILER] Message sent:', info.messageId);
}
