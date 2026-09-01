// ─────────────────────────────────────────────────────────────────────────────
// Email transport — Brevo (Sendinblue) transactional API (primary path).
//
// History: Nodemailer/SMTP → Resend SDK → Brevo REST API (called via axios, an
// existing dependency). Brevo delivers to ANY recipient using only a verified
// sender email — no custom domain required.
//
// The previous transports are retained below, commented out, for easy rollback.
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class SmtpNotConfiguredError extends Error {
  constructor(message = 'SMTP_NOT_CONFIGURED') {
    super(message);
    this.name = 'SmtpNotConfiguredError';
  }
}

// ─── Legacy Nodemailer/SMTP transport (COMMENTED OUT — kept for rollback) ───
// To roll back: re-comment the Resend implementation below and uncomment this
// block, then restore the `import nodemailer from 'nodemailer'` line above.
//
// import nodemailer from 'nodemailer';
//
// const isPlaceholder = (val?: string) => {
//   if (!val) return true;
//   const lower = val.toLowerCase().trim();
//   return lower.includes('your-email') || lower.includes('your-app-password') || lower.includes('your-domain') || lower.includes('example.com');
// };
//
// export function isSmtpConfigured(): boolean {
//   const smtpUser = process.env.SMTP_USER?.trim();
//   const smtpPass = process.env.SMTP_PASS?.trim();
//   const smtpHost = process.env.SMTP_HOST?.trim();
//   return (
//     !!smtpUser &&
//     !!smtpPass &&
//     !!smtpHost &&
//     !isPlaceholder(smtpUser) &&
//     !isPlaceholder(smtpPass)
//   );
// }
//
// /**
//  * Dynamically creates a Nodemailer transporter using current environment variables.
//  * Reading env vars lazily at call time ensures runtime environment updates are honored.
//  */
// function getTransporter() {
//   if (!isSmtpConfigured()) return null;
//
//   const smtpHost = process.env.SMTP_HOST!.trim();
//   const smtpPort = Number(process.env.SMTP_PORT || 587);
//   const smtpUser = process.env.SMTP_USER!.trim();
//   const smtpPass = process.env.SMTP_PASS!.trim();
//   const isSecure = smtpPort === 465;
//
//   return nodemailer.createTransport({
//     host: smtpHost,
//     port: smtpPort,
//     secure: isSecure,
//     // For non-465 ports (e.g. 587), STARTTLS is initiated automatically by Nodemailer.
//     // Allow overriding TLS rejection if self-signed certs are used in dev.
//     tls: {
//       rejectUnauthorized: process.env.SMTP_IGNORE_TLS === 'true' ? false : true,
//     },
//     auth: {
//       user: smtpUser,
//       pass: smtpPass,
//     },
//   });
// }
//
// export async function sendMail(to: string, subject: string, html: string) {
//   const transporter = getTransporter();
//   if (!transporter) {
//     console.error('[MAILER ERROR] SMTP credentials missing or invalid in environment');
//     throw new SmtpNotConfiguredError('SMTP server or credentials are not configured.');
//   }
//
//   const smtpHost = process.env.SMTP_HOST?.trim();
//   const smtpPort = Number(process.env.SMTP_PORT || 587);
//   const smtpUser = process.env.SMTP_USER?.trim();
//   const fromAddress = process.env.SMTP_FROM?.trim() || smtpUser || 'no-reply@projectcollab.ai';
//
//   console.log('[MAILER LOG] Attempting sendMail with runtime config:', {
//     SMTP_HOST: smtpHost,
//     SMTP_PORT: smtpPort,
//     SMTP_USER: smtpUser,
//     FROM_ADDRESS: fromAddress,
//     TO: to,
//     secure: smtpPort === 465,
//   });
//
//   try {
//     const info = await transporter.sendMail({
//       from: fromAddress,
//       to,
//       subject,
//       html,
//     });
//     console.log('[MAILER SUCCESS] Message sent successfully:', {
//       messageId: info.messageId,
//       accepted: info.accepted,
//       rejected: info.rejected,
//       response: info.response,
//     });
//     return info;
//   } catch (err: any) {
//     // Log complete Nodemailer error properties for deep diagnosis
//     console.error('[MAILER ERROR] Email delivery failed:', {
//       message: err.message,
//       code: err.code,
//       command: err.command,
//       responseCode: err.responseCode,
//       response: err.response,
//       stack: err.stack,
//     });
//     throw new SmtpNotConfiguredError(`Email delivery failed [${err.code || 'UNKNOWN'}]: ${err.message}`);
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────

// ─── Legacy Resend transport (COMMENTED OUT — kept for rollback) ────────────
// To roll back: comment out the Brevo implementation below and uncomment this
// block, then restore the `import { Resend } from 'resend'` line above.
//
// import { Resend } from 'resend';
//
// /**
//  * Lazily builds a Resend client from the current environment variables.
//  * Reading env vars lazily at call time ensures runtime environment updates are honored.
//  * Returns null when RESEND_API_KEY is missing or blank.
//  */
// function getResendClient(): Resend | null {
//   const apiKey = process.env.RESEND_API_KEY?.trim();
//   if (!apiKey) return null;
//   return new Resend(apiKey);
// }
//
// export async function sendMail(to: string, subject: string, html: string) {
//   const resend = getResendClient();
//   if (!resend) {
//     console.error('[MAILER ERROR] RESEND_API_KEY missing or invalid in environment');
//     throw new SmtpNotConfiguredError('Resend API key is not configured.');
//   }
//
//   // Verified sender address. Falls back to Resend's shared test domain,
//   // which only delivers to the Resend account owner's own inbox until a
//   // custom domain is verified. FROM_ADDRESS should use the format
//   // "ProjectCollab AI <no-reply@yourdomain.com>" once a domain is verified.
//   const fromAddress = process.env.FROM_ADDRESS?.trim() || 'onboarding@resend.dev';
//   const apiKeyTail = process.env.RESEND_API_KEY?.trim().slice(-4);
//
//   console.log('[MAILER LOG] Attempting sendMail via Resend with runtime config:', {
//     RESEND_API_KEY: apiKeyTail ? `***${apiKeyTail}` : undefined,
//     FROM_ADDRESS: fromAddress,
//     TO: to,
//   });
//
//   try {
//     const { data, error } = await resend.emails.send({
//       from: fromAddress,
//       to,
//       subject,
//       html,
//     });
//
//     // The Resend SDK returns API-level errors on the response object instead
//     // of throwing, so they must be checked explicitly.
//     if (error) {
//       console.error('[MAILER ERROR] Email delivery failed:', {
//         message: error.message,
//         name: error.name,
//         statusCode: error.statusCode,
//       });
//       throw new SmtpNotConfiguredError(`Email delivery failed [${error.name || 'UNKNOWN'}]: ${error.message}`);
//     }
//
//     console.log('[MAILER SUCCESS] Message sent successfully:', {
//       id: data?.id,
//     });
//     return data;
//   } catch (err: any) {
//     // Already logged + wrapped above — rethrow untouched.
//     if (err instanceof SmtpNotConfiguredError) throw err;
//
//     // Network/SDK-level failures land here. Log complete error properties for deep diagnosis.
//     console.error('[MAILER ERROR] Email delivery failed:', {
//       message: err.message,
//       name: err.name,
//       code: err.code,
//       statusCode: err.statusCode,
//       stack: err.stack,
//     });
//     throw new SmtpNotConfiguredError(`Email delivery failed [${err.name || err.code || 'UNKNOWN'}]: ${err.message}`);
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────

// Brevo transactional email endpoint (v3).
const BREVO_SEND_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Lazily reads Brevo configuration from the current environment variables.
 * Reading env vars lazily at call time ensures runtime environment updates are honored.
 * Returns null when BREVO_API_KEY is missing or blank.
 *
 * The sender MUST be an email address verified in the Brevo account
 * (Brevo dashboard → Senders, Domains & Dedicated IPs). A verified Gmail
 * address works and delivers to ANY recipient — no custom domain needed.
 */
function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return null;

  const senderEmail =
    process.env.BREVO_SENDER?.trim() || 'madansudharshan@gmail.com'; // verified in Brevo
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'ProjectCollab AI';

  return { apiKey, senderEmail, senderName };
}

export async function sendMail(to: string, subject: string, html: string) {
  const config = getBrevoConfig();
  if (!config) {
    console.error('[MAILER ERROR] BREVO_API_KEY missing or invalid in environment');
    throw new SmtpNotConfiguredError('Brevo API key is not configured.');
  }

  console.log('[MAILER LOG] Attempting sendMail via Brevo with runtime config:', {
    BREVO_API_KEY: `***${config.apiKey.slice(-4)}`,
    SENDER: `${config.senderName} <${config.senderEmail}>`,
    TO: to,
  });

  try {
    // Brevo v3 transactional email — POST /smtp/email
    // (https://developers.brevo.com/reference/send-transac-email)
    const response = await axios.post(
      BREVO_SEND_ENDPOINT,
      {
        sender: { name: config.senderName, email: config.senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          'api-key': config.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[MAILER SUCCESS] Message sent successfully:', {
      messageId: response.data?.messageId,
    });
    return response.data;
  } catch (err: any) {
    // Axios errors carry the Brevo API error payload in err.response.data
    // (e.g. { code: 'unauthorized', message: 'Key not found' } for a bad key,
    // or a validation error when the sender is not verified in Brevo).
    console.error('[MAILER ERROR] Email delivery failed:', {
      message: err.message,
      status: err.response?.status,
      brevoError: err.response?.data,
      code: err.code,
      stack: err.stack,
    });
    const brevoMessage = err.response?.data?.message || err.message;
    throw new SmtpNotConfiguredError(`Email delivery failed [${err.response?.status || err.code || 'UNKNOWN'}]: ${brevoMessage}`);
  }
}

