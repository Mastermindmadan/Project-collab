// src/config/cors.ts
//
// Centralized CORS allow-list for this application.
//
// Local dev origins AND the known production (Vercel) frontend are ALWAYS
// allowed, regardless of the ALLOWED_ORIGINS env var. They are merged
// additively so a placeholder or otherwise misconfigured ALLOWED_ORIGINS value
// never silently blocks a known deployment.
//
// Environment awareness:
//   - Development: http://localhost / http://127.0.0.1 (any port) always allowed.
//   - Production:  https://project-collab-one.vercel.app always allowed, plus
//                  anything listed in the ALLOWED_ORIGINS env var.
const DEFAULT_ALLOWED_ORIGINS: string[] = [
  // ── Local development (always allowed) ───────────────────────────────
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  // ── Production frontend (Vercel — always allowed) ─────────────────────
  'https://project-collab-one.vercel.app',
];

// Backwards-compatible alias for any existing imports.
export const LOCAL_DEV_ORIGINS = DEFAULT_ALLOWED_ORIGINS;

/** HTTP methods the API + preflight must accept (incl. the OPTIONS preflight). */
export const ALLOWED_METHODS: string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

/** Headers the API + preflight must accept (JWT auth travels via Authorization). */
export const ALLOWED_HEADERS: string[] = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
];

/**
 * This app authenticates with a Bearer JWT (Authorization header) and a refresh
 * token sent in the request body — it does NOT rely on browser cookies.
 * CORS credentials must therefore stay disabled so we never echo
 * `Access-Control-Allow-Credentials` for a cross-origin request.
 */
export const USE_CREDENTIALS = false;

export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return [...DEFAULT_ALLOWED_ORIGINS];

  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Defaults are merged first so a bad ALLOWED_ORIGINS value can never remove
  // the known-local/production origins.
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured])];
}

export function isOriginAllowed(origin: string | undefined): boolean {
  // Requests without an Origin header (curl, non-browser clients, same-origin
  // requests) are always allowed.
  if (!origin) return true;

  const allowed = getAllowedOrigins();

  // Support a `*` wildcard entry for convenience (e.g. rapid prototyping).
  if (allowed.includes('*')) return true;
  if (allowed.includes(origin)) return true;

  // Any localhost / 127.0.0.1 origin (any port) is a local dev server — allow
  // it so dev ports beyond the defaults (e.g. 5174 when 5173 is busy, or
  // `vite preview` on 4173) are never CORS-blocked.
  try {
    const host = new URL(origin).hostname;
    const stripped = host.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      stripped === '::1' ||
      stripped === '0:0:0:0:0:0:0:1'
    ) {
      return true;
    }
  } catch {
    // Malformed origin — fall through and disallow.
  }

  return false;
}
