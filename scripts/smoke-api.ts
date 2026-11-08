/**
 * Adapter + real-server smoke test. No test runner/deps are added; run with
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-api.ts            # offline samples + live
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-api.ts --offline  # samples only (no network)
 *
 * Live part creates ONE simulation session on https://nemosdream.cloud and
 * plays it (the only writes this script is allowed to make).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OFFLINE = process.argv.includes("--offline");
const BASE = "https://nemosdream.cloud";
const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../docs/integration/samples");

// ── Node shims: sessionStorage + absolute fetch + request recording ──────────
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
const realFetch = globalThis.fetch;
const sent: { url: string; method: string; body: unknown }[] = [];
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" && input.startsWith("/") ? BASE + input : String(input);
  sent.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
  return realFetch(url, init);
}) as typeof fetch;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const sample = (f: string): Any => JSON.parse(readFileSync(path.join(SAMPLES, f), "utf8"));

const { toGameState, toAdvanceHalf, toPaResult } = await import("../src/api/adapters/state");
const { toRecommendBundle } = await import("../src/api/adapters/recommend");
const { toResult, toRepeat } = await import("../src/api/adapters/result");
const { toGame } = await import("../src/api/adapters/meta");
const { realApi } = await import("../src/api/endpoints");
const { ApiRequestError } = await import("../src/api/client");

// ── Offline: samples through the adapters ────────────────────────────────────
console.log("\n# offline (docs/integration/samples)");
const st = toGameState(sample("sessions.json").state);
check("state: camelCase + myRole defense", st.myRole === "defense" && st.sessionId.startsWith("s_"), st.myRole);
check("state: home/away injected (server sends none)", st.homeTeam.length === 2 && st.awayTeam.length === 2 && st.homeTeam !== st.awayTeam, [st.homeTeam, st.awayTeam]);
check("state: score stays {home,away}", typeof st.score.home === "number" && typeof st.score.away === "number");
check("state: linescore totals keep R/H/E/B keys", ["R", "H", "E", "B"].every((k) => k in st.linescore.totals.home), Object.keys(st.linescore.totals.home));
check("state: null season.era/whip preserved", st.currentPitcher.season.era === null && st.currentPitcher.season.whip === null);
check("state: null batter rate stats preserved", st.currentBatter.season.avg === null);
check("state: vs_batter_hand L/R keys kept", "L" in st.currentPitcher.vsBatterHand && "R" in st.currentPitcher.vsBatterHand);
check("state: Pitcher.pitcherId stays a number", typeof st.currentPitcher.pitcherId === "number");

const pa = toPaResult(sample("simulate-pa-1-actual.json").result);
check("pa: probs has all 9 outcome keys", ["1B", "2B", "3B", "HR", "BB", "SO", "GO", "FO", "GDP"].every((k) => k in pa.probs));
check("pa: source passed through", pa.source === "actual", pa.source);

const rec = toRecommendBundle("s_x", sample("recommend-after-diverge.json"));
const scores = rec.ranking.candidates.map((c) => c.modelScore);
check("recommend: server order kept (scores non-increasing)", scores.every((s, i) => i === 0 || s <= scores[i - 1]), scores);
check("recommend: ReliefCandidate.pitcherId is a string", rec.ranking.candidates.every((c) => typeof c.pitcherId === "string"));
check("recommend: used pitchers split out (no score)", (rec.ranking.usedPitchers?.length ?? 0) === 2 && rec.ranking.candidates.length === 6, [rec.ranking.usedPitchers?.length, rec.ranking.candidates.length]);
check("recommend: null quality_percentile stays null (not 0)", rec.ranking.candidates.some((c) => c.qualityPercentile === null));
check("recommend: actual_decision null after diverging", rec.summary.actualDecision === null);

const rawAdv = sample("advance-half.json").summary;
const adv = toAdvanceHalf(sample("advance-half.json"));
check("advance-half: deltaWe = we_trace[i+1]-we_trace[i]", Math.abs((adv.summary.paLog[0].deltaWe ?? 99) - (rawAdv.we_trace[1] - rawAdv.we_trace[0])) < 1e-3, adv.summary.paLog[0].deltaWe);
check("advance-half: runsScored null (not sent)", adv.summary.paLog.every((p) => p.runsScored === null));
check("advance-half: next state is defense", adv.state.myRole === "defense");

const meta = { sessionId: "s_x", myTeam: "HH", oppTeam: "KT", gameId: "20250322HHKT02025", startInning: 7, homeTeam: "KT", awayTeam: "HH", date: "2025-03-22" };
const rawRes = sample("result.json");
const res = toResult(rawRes, meta);
check("result: {my,opp} mapped to mine/opp", res.myFinalScore.mine === rawRes.simulated.score.my && res.myFinalScore.opp === rawRes.simulated.score.opp, res.myFinalScore);
const swapped = toResult({ ...rawRes, simulated: { ...rawRes.simulated, score: { home: 1, away: 5 } } }, meta);
check("result: {home,away} also handled (HH away → mine = away)", swapped.myFinalScore.mine === 5 && swapped.myFinalScore.opp === 1, swapped.myFinalScore);
check("result: result is win/loss/tie/in_progress", ["win", "loss", "tie", "in_progress"].includes(res.result), res.result);
check("result: null model fields survive", res.modelComparison.myWithinTopK === null && res.decisions.every((d) => d.modelTop === null));

const rawRep = sample("repeat-n10.json");
const rep = toRepeat(rawRep, { myRunsAllowed: 2 });
const total = (Object.values(rawRep.runs_allowed.histogram) as number[]).reduce((a, b) => a + b, 0);
check("repeat: histogram map → 0..6 + 7+, counts preserved", rep.histogram.length === 8 && rep.histogram.reduce((a, b) => a + b.count, 0) === total, rep.histogram);

const game = toGame({ game_id: "20250902HHKT02025", date: "2025-09-02", away: "HH", home: "KT", final_score: { away: 6, home: 9 }, available_innings: [5, 7], high_leverage_innings: [7] });
check("games: date normalized to YYYY.MM.DD for the picker", game.date === "2025.09.02", game.date);

// ── pitcherId: number conversion only in endpoints.simulatePa ────────────────
console.log("\n# pitcherId handling");
sent.length = 0;
let rejected = false;
try {
  await realApi.simulatePa("s_none", "abc");
} catch (e) {
  rejected = e instanceof ApiRequestError && e.code === "INVALID_REQUEST";
}
check("simulatePa rejects a non-numeric id before any request", rejected && sent.length === 0, sent);

if (OFFLINE) {
  console.log(failures ? `\n${failures} FAILED` : "\nall passed (offline)");
  process.exit(failures ? 1 : 0);
}

// ── Live: one simulation session on the real server ─────────────────────────
console.log("\n# live (https://nemosdream.cloud) — one simulation session");
check("health", (await realApi.health()) === true);
const cfg = await realApi.getConfig();
check("config: bands + model.provisional", cfg.leverage.bands.length > 0 && typeof cfg.model?.provisional === "boolean");
const teams = await realApi.getTeams();
check("teams: 10", teams.length === 10, teams.length);
const games = await realApi.getGames("HH", "KT");
const g = games.find((x) => x.availableInnings.includes(7));
check("games: HH vs KT with 7th available", !!g, games.length);
if (!g) process.exit(1);
const { state: s0 } = await realApi.createSession({ myTeam: "HH", oppTeam: "KT", gameId: g.gameId, startInning: 7 });
const sid = s0.sessionId;
check("session: defense, home/away resolved", s0.myRole === "defense" && s0.homeTeam === g.home && s0.awayTeam === g.away, [s0.homeTeam, g.home]);
const bundle = await realApi.recommend(sid, s0);
check("recommend: candidates with string ids", bundle.ranking.candidates.length > 0 && typeof bundle.ranking.candidates[0].pitcherId === "string");

sent.length = 0;
let cur = (await realApi.simulatePa(sid, String(s0.currentPitcher.pitcherId))).result;
const body = sent.find((r) => r.url.endsWith("/simulate-pa"))?.body as { pitcher_id: unknown } | undefined;
check("simulate-pa request body: pitcher_id is a number", typeof body?.pitcher_id === "number", body);
// "Stay" only replays the real game if the real manager also stayed. When
// actual_decision.was_change is true, keeping the current pitcher already diverges.
const expectDiverge = bundle.summary.actualDecision?.wasChange === true;
check(`simulate-pa (stay): ${expectDiverge ? "diverges (manager changed pitchers)" : "replays actual"}`, (cur.source === "simulated") === expectDiverge && cur.nextState.isDiverged === expectDiverge, [cur.source, cur.nextState.isDiverged, expectDiverge]);

let guard = 0;
while (cur.nextState.myRole === "defense" && !cur.nextState.isGameOver && guard++ < 25) {
  cur = (await realApi.simulatePa(sid, String(cur.nextState.currentPitcher.pitcherId))).result;
}
check("3 outs → my_role offense", cur.nextState.myRole === "offense", cur.nextState.myRole);
const advRes = await realApi.advanceHalf(sid);
check("advance-half: defense again (or game over); we_trace = PAs + 1", (advRes.state.myRole === "defense" || advRes.state.isGameOver) && advRes.summary.weTrace.length === advRes.summary.paLog.length + 1, [advRes.state.myRole, advRes.summary.weTrace.length, advRes.summary.paLog.length]);
const wt = await realApi.getWeTrace(sid);
check("we-trace: perspective = my_team", wt.perspective === "HH", wt.perspective);
const result = await realApi.getResult(sid);
check("result: kind + mine/opp numbers", typeof result.myFinalScore.mine === "number" && ["win", "loss", "tie", "in_progress"].includes(result.result), result.result);
const rr = await realApi.getRepeatSimulation(sid, 10, { myRunsAllowed: result.runsAllowedInRange.mine });
check("repeat n=10: 8 buckets", rr.histogram.length === 8 && rr.n === 10, rr.n);
const { state: back } = await realApi.undoLast(sid);
check("undo: returns a state", !!back.sessionId, back.myRole);

console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
