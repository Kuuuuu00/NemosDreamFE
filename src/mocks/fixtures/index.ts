/**
 * Recorded / derived `GET /result` bodies for mock mode. Open
 * `/result/fixture-<name>` (with VITE_USE_MOCK=true); append `--slow` to delay
 * the answer by 6 s (loading skeleton).
 *
 * `in-progress` and `final` are real responses from the deployed server
 * (2025-11-10). The others are derived from them — see `_fixture_note` in each file.
 */
import type { RawResult, RawWeTrace } from "@/api/raw";
import inProgress from "./result_in_progress.json";
import final from "./result_final.json";
import keepOnly from "./result_keep_only.json";
import diverged from "./result_diverged.json";
import modelError from "./result_model_error.json";
import noChanges from "./result_no_changes.json";
import ranked from "./result_ranked.json";
import weTrace from "./we_trace.json";

const RESULTS: Record<string, unknown> = {
  "in-progress": inProgress,
  final,
  "keep-only": keepOnly,
  diverged,
  "model-error": modelError,
  "no-changes": noChanges,
  ranked,
};

export const FIXTURE_PREFIX = "fixture-";

export function fixtureResult(sessionId: string): { raw: RawResult; slow: boolean } | null {
  if (!sessionId.startsWith(FIXTURE_PREFIX)) return null;
  const slow = sessionId.endsWith("--slow");
  const name = sessionId.slice(FIXTURE_PREFIX.length).replace(/--slow$/, "");
  const raw = RESULTS[name];
  return raw ? { raw: raw as RawResult, slow } : null;
}

export const fixtureWeTrace = weTrace as unknown as RawWeTrace;
export const FIXTURE_META = {
  myTeam: "HH",
  oppTeam: "KT",
  homeTeam: "KT",
  awayTeam: "HH",
  date: "2025-09-20",
  startInning: 7,
  gameId: "20250920HHKT02025",
} as const;
