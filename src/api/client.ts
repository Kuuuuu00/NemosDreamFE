/**
 * Thin fetch wrapper for the real backend (연동 명세 §0).
 *  - JSON in/out, snake_case on the wire (no key conversion here).
 *  - Success is `res.ok` — POST /sessions returns 201, never compare to 200.
 *  - Every failure is normalized into `ApiRequestError` (`code`, `message`,
 *    `recoverable`) so callers branch on `code`, never on message text.
 *  - Network failure / timeout (no response body) → `NETWORK_ERROR`,
 *    `recoverable: true`.
 *  - A caller-initiated abort (stale-request invalidation) is NOT an error
 *    the UI should show: it throws `ApiRequestError` with code `ABORTED`;
 *    use `isAbortError()` to ignore it.
 */
import type { ApiErrorCode } from "@/types/api";
import type { RawErrorBody } from "./raw";

/** `""` in dev = same-origin, requests go through the Vite proxy. */
export const API_BASE: string = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");
export const USE_MOCK: boolean = import.meta.env?.VITE_USE_MOCK === "true";

export const DEFAULT_TIMEOUT_MS = 10_000;
/** `POST /repeat` runs the whole game n times server-side. */
export const REPEAT_TIMEOUT_MS = 30_000;

export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly recoverable: boolean;
  readonly status: number | null;

  constructor(code: ApiErrorCode, message: string, recoverable: boolean, status: number | null = null) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.recoverable = recoverable;
    this.status = status;
  }
}

export function isApiError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError;
}

export function isAbortError(e: unknown): boolean {
  return e instanceof ApiRequestError && e.code === "ABORTED";
}

const KNOWN_CODES: readonly ApiErrorCode[] = [
  "INVALID_REQUEST",
  "INVALID_ROLE",
  "GAME_NOT_FOUND",
  "SESSION_EXPIRED",
  "CANNOT_UNDO",
  "NO_AVAILABLE_PITCHER",
  "MODEL_UNAVAILABLE",
  "INTERNAL_ERROR",
];

function normalizeFailure(status: number, body: unknown): ApiRequestError {
  const e = (body as RawErrorBody | null)?.error;
  if (e && typeof e.code === "string") {
    const code = (KNOWN_CODES as readonly string[]).includes(e.code) ? (e.code as ApiErrorCode) : "INTERNAL_ERROR";
    return new ApiRequestError(code, e.message ?? "", e.recoverable ?? status >= 500, status);
  }
  // No parseable error envelope (proxy error page, gateway timeout, ...).
  return status >= 500
    ? new ApiRequestError("INTERNAL_ERROR", `HTTP ${status}`, true, status)
    : new ApiRequestError("INVALID_REQUEST", `HTTP ${status}`, false, status);
}

export interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  /** Abort to invalidate a superseded request (late responses must not overwrite newer state). */
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) qs.set(k, String(v));
  const s = qs.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ""}`;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onExternalAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    if (opts.signal?.aborted && !timedOut) throw new ApiRequestError("ABORTED", "request aborted", false);
    throw new ApiRequestError(
      "NETWORK_ERROR",
      timedOut ? "요청 시간이 초과되었습니다." : "서버에 연결할 수 없습니다.",
      true,
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  let text: string;
  try {
    text = await res.text();
  } catch {
    throw new ApiRequestError("NETWORK_ERROR", "응답을 읽을 수 없습니다.", true);
  }
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON body: handled below */
    }
  }
  if (!res.ok) throw normalizeFailure(res.status, json);
  if (json === null) throw new ApiRequestError("INTERNAL_ERROR", "응답을 해석할 수 없습니다.", true, res.status);
  return json as T;
}

/** `GET /health` answers plain-text `OK` (not JSON). Only `res.ok` counts. */
export async function ping(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await send("/health", { signal, timeoutMs: 5000 });
    return res.ok;
  } catch {
    return false;
  }
}

/** Absolute URL for `/static/players/{id}.webp`-style paths (연동 명세 §0-5). */
export function resolvePhotoUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url; // already absolute
  // Relative: dev has an empty API_BASE (stays same-origin → Vite `/static` proxy),
  // production prefixes the server origin.
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}
