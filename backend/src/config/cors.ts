// Local dev origins that must ALWAYS work, regardless of the ALLOWED_ORIGINS
// env var. They are merged in additively so that a placeholder or otherwise
// misconfigured ALLOWED_ORIGINS value never silently breaks local development
// (which was the root cause of the "can't log in / blocked by CORS" issue).
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return [...LOCAL_DEV_ORIGINS];

  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Merge local dev origins first so they can never be overridden away.
  return [...new Set([...LOCAL_DEV_ORIGINS, ...configured])];
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
