/**
 * sessionStorage-backed session snapshot (연동 명세 §7 #2 / REPORT #4).
 *
 * TODO(backend): replace with `GET /api/v1/sessions/{id}` once it exists.
 * There is no state-read endpoint, so a page refresh on /game can only be
 * restored from the last `GameState` we saved ourselves.
 *
 * Everything here is best-effort: sessionStorage can be unavailable or
 * full, and the app must render correctly without it.
 */
import type { GameState, SessionParams } from "@/types/api";

export interface SessionMeta extends SessionParams {
  sessionId: string;
  homeTeam: string;
  awayTeam: string;
  date: string;
}

const KEY_CURRENT = "nemo:current-session";
const keyMeta = (id: string) => `nemo:session:${id}:meta`;
/**
 * `{ state, history }` live under ONE key and are written together, once, at
 * the end of each successful response. They can't drift apart across a page
 * refresh (state from after an undo with a history from before it, etc.).
 * `meta` is written once at session start and never changes.
 */
const keySnapshot = (id: string) => `nemo:session:${id}:snapshot`;

interface StoredSnapshot {
  state: GameState;
  /** `useGameHistory`'s serialized store (opaque here); null until the first save. */
  history: unknown | null;
}

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable/full — restore just won't work */
  }
}

/** home/away per game, filled from `GET /games` (the only place the server tells us). */
const gameTeams = new Map<string, { home: string; away: string; date: string }>();

export function rememberGame(gameId: string, home: string, away: string, date: string): void {
  gameTeams.set(gameId, { home, away, date });
}

/**
 * Resolve home/away for a game. Order: games response seen this page load →
 * last-resort parse of `game_id` (`YYYYMMDD` + AWAY + HOME + `NNNNN`; verified
 * against 142 live games).
 * TODO(backend): drop both once `GameState.home_team/away_team` is sent (REPORT #1).
 */
export function resolveGameTeams(gameId: string): { home: string; away: string; date: string } | null {
  const known = gameTeams.get(gameId);
  if (known) return known;
  const m = /^(\d{4})(\d{2})(\d{2})([A-Z]{2})([A-Z]{2})\d{5}$/.exec(gameId);
  if (!m) return null;
  return { away: m[4], home: m[5], date: `${m[1]}-${m[2]}-${m[3]}` };
}

export function saveSession(meta: SessionMeta, state: GameState): void {
  write(KEY_CURRENT, meta.sessionId);
  write(keyMeta(meta.sessionId), meta);
  write(keySnapshot(meta.sessionId), { state, history: null } satisfies StoredSnapshot);
}

/** Persist the confirmed server `state` together with the matching history. Call once, after both are updated. */
export function saveSnapshot(sessionId: string, state: GameState, history: unknown): void {
  write(keySnapshot(sessionId), { state, history } satisfies StoredSnapshot);
}

export function loadMeta(sessionId: string): SessionMeta | null {
  return read<SessionMeta>(keyMeta(sessionId));
}

export function currentSessionId(): string | null {
  return read<string>(KEY_CURRENT);
}

/** Last saved state + history + meta for a session, or null (never saved / storage unavailable). */
export function loadSnapshot(sessionId: string): { meta: SessionMeta; state: GameState; history: unknown | null } | null {
  const meta = loadMeta(sessionId);
  const snap = read<StoredSnapshot>(keySnapshot(sessionId));
  return meta && snap?.state ? { meta, state: snap.state, history: snap.history ?? null } : null;
}

/** Snapshot of the session the user was last in (page refresh on /game). */
export function loadCurrentSnapshot(): { meta: SessionMeta; state: GameState; history: unknown | null } | null {
  const id = currentSessionId();
  return id ? loadSnapshot(id) : null;
}

/** Drop everything stored for a session (SESSION_EXPIRED, new game). */
export function clearSession(sessionId: string): void {
  try {
    sessionStorage.removeItem(keyMeta(sessionId));
    sessionStorage.removeItem(keySnapshot(sessionId));
    if (currentSessionId() === sessionId) sessionStorage.removeItem(KEY_CURRENT);
  } catch {
    /* ignore */
  }
}
