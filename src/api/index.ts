/**
 * The one import hooks use for backend access: `import { api } from "@/api"`.
 * Components never import `@/api` or `@/mocks` directly (hooks only).
 */
import { USE_MOCK } from "./client";
import { realApi } from "./endpoints";
import { mockApi, mockExtras as mockOnly } from "./mockAdapter";
import type { ApiSurface } from "./types";

export const api: ApiSurface = USE_MOCK ? mockApi : realApi;

/** Data only the mock can provide (`null` in API mode). Do not build new features on it. */
export const mockExtras = USE_MOCK ? mockOnly : null;

export { USE_MOCK } from "./client";
export { ApiRequestError, isAbortError, isApiError } from "./client";
export { createLatest } from "./latest";
export type { ApiSurface, RecommendBundle } from "./types";
