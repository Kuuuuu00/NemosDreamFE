/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin. Empty in dev (Vite proxy), https://api.nemosdream.cloud in production. */
  readonly VITE_API_BASE?: string;
  /** "true" → run against src/mocks instead of the real backend. */
  readonly VITE_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
