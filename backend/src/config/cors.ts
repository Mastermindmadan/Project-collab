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

  return allowed.includes(origin);
}
