// Central accessor for Vite-injected env vars (`import.meta.env`).
//
// Vite inlines real values at build/dev time. Unit tests run outside of Vite
// (via ts-jest/Jest in CommonJS mode, which does not provide `import.meta.env`),
// so this module falls back to an empty object rather than crashing — and tests
// can mock it with `jest.mock('../utils/apiEnv', ...)`.

interface ViteEnvShape {
  VITE_API_URL?: string;
  DEV?: boolean;
}

const importMetaEnv: ViteEnvShape =
  ((import.meta as unknown as { env?: ViteEnvShape }).env) ?? {};

/** Base backend API URL (from `VITE_API_URL`). */
export const VITE_API_URL: string | undefined = importMetaEnv.VITE_API_URL;

/** True when running under the Vite dev server. */
export const VITE_DEV: boolean = Boolean(importMetaEnv.DEV);