const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
];

export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  const configured = getAllowedOrigins();
  if (configured.includes(origin)) return true;

  // Allow all Vercel preview deployment URLs automatically
  if (origin.endsWith('.vercel.app')) return true;

  // Allow Render internal health checks
  if (origin.endsWith('.onrender.com')) return true;

  return false;
}
