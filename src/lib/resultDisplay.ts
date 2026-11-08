import type { BaseState, DecisionLogEntry, Half, PitcherUsageSegment } from "@/types/api";

function halfLabel(half: Half): "초" | "말" {
  return half === "top" ? "초" : "말";
}

function outCountLabel(n: number): string {
  return n === 0 ? "무사" : `${n}사`;
}

function baseStateLabel(base: BaseState): string {
  switch (base) {
    case "0":
      return "";
    case "1":
      return "1루";
    case "2":
      return "2루";
    case "3":
      return "3루";
    case "12":
      return "1·2루";
    case "13":
      return "1·3루";
    case "23":
      return "2·3루";
    case "123":
      return "만루";
  }
}

export function situationLabel(inning: number, half: Half, outCount: number | null, base: BaseState | null): string {
  // TODO(backend): out_count / base_state (REPORT #2). Until the server sends them, show inning/half only.
  if (outCount === null || base === null) return inningHalfLabel(inning, half);
  const baseTxt = baseStateLabel(base);
  return `${inning}회${halfLabel(half)} ${outCountLabel(outCount)}${baseTxt ? ` ${baseTxt}` : ""}`;
}

export function inningHalfLabel(inning: number, half: Half): string {
  return `${inning}회${halfLabel(half)}`;
}

export function modelTop(d: DecisionLogEntry): { name: string } | null {
  return d.modelTop ?? d.modelRanking[0] ?? null;
}

/** "이름 (N위)" — the model's rank as a reference, never a verdict.
 * Name comes from the server row when present; rank is omitted when null
 * (TODO(backend): model rank fields are null for now). */
export function choiceWithRank(d: DecisionLogEntry, pitcherId: number | null): string | null {
  if (pitcherId === null) return null;
  const isMine = pitcherId === d.chosenPitcherId;
  const isActual = pitcherId === d.actualPitcherId;
  const found = d.modelRanking.find((c) => c.pitcherId === pitcherId);
  const name = (isMine ? d.chosenName : isActual ? d.actualName : null) ?? found?.name ?? null;
  if (!name) return null;
  const rank = (isMine ? d.chosenModelRank : isActual ? d.actualModelRank : null) ?? found?.modelRank ?? null;
  return rank === null ? name : `${name} (${rank}위)`;
}

/** Default view = decisions that actually changed the pitcher. `isChange` is
 * undefined in mock mode → treated as a change (existing behaviour). */
export function visibleDecisions(decisions: DecisionLogEntry[], showAll: boolean): DecisionLogEntry[] {
  return showAll ? decisions : decisions.filter((d) => d.isChange !== false);
}

export function runsScoredLabel(runs: number | null): string {
  return runs === null ? "—" : runs > 0 ? `${runs}실점` : "무실점";
}

/** PAs I faced per defensive half ("inning-half" → count), from `decisions`
 * (one row per defensive PA, kept or changed). Gives the exact half length for
 * MY usage even when a pitcher continues past the half. `actual_pitcher_usage`
 * has no such rows, so it can't use this. */
export function halfPaTotals(decisions: DecisionLogEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const d of decisions) {
    const key = `${d.inning}-${d.half}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  return totals;
}

/** Timeline spans in "out" units (3 = one defensive half-inning, one per inning).
 *
 * With PA positions (real backend): a segment inside one half gets a share of
 * that half proportional to its PAs. `pa` is 0-based and `toPa` inclusive
 * (samples/result.json: 김서현 0→1 and 와이스 2→2 in 7회말), so
 *   width = (toPa - fromPa + 1) / halfTotal * 3.
 * `halfTotal` comes from, in order:
 *  1. `halfTotals` (my `decisions`: exact, even if a pitcher pitches across halves);
 *  2. the last segment ending in that half (`toPa + 1`) — only when no pitcher
 *     continues past that half;
 *  3. unknown (the `actual_pitcher_usage` case where a pitcher crosses a half
 *     with a mid-half entry): the entry point falls back to the middle of the
 *     half and the previous segment is cut there ("반반").
 *
 * Without PA positions (mock): a segment covers whole innings and two
 * segments meeting inside one inning split it in half. */
export function timelineSpans(
  segments: PitcherUsageSegment[],
  startInning: number,
  halfTotals?: ReadonlyMap<string, number>,
): { start: number; end: number }[] {
  const halfKey = (inning: number, half: string) => `${inning}-${half}`;
  const base = (inning: number) => Math.max(0, inning - startInning) * 3;

  const lastTo = new Map<string, number>();
  const openHalves = new Set<string>(); // a pitcher continues past this half
  for (const s of segments) {
    const toKey = halfKey(s.toInning, s.toHalf);
    if (s.toPa !== undefined) lastTo.set(toKey, Math.max(lastTo.get(toKey) ?? 0, s.toPa + 1));
    if (halfKey(s.fromInning, s.fromHalf) !== toKey) openHalves.add(halfKey(s.fromInning, s.fromHalf));
  }
  const totalOf = (key: string): number | undefined => {
    const known = halfTotals?.get(key);
    if (known !== undefined) return Math.max(known, lastTo.get(key) ?? 0);
    return openHalves.has(key) ? undefined : lastTo.get(key);
  };

  const spans = segments.map((s) => {
    const coarse = { start: base(s.fromInning), end: base(s.toInning) + 3, midStart: true };
    if (s.fromPa === undefined || s.toPa === undefined) return coarse;
    const toTotal = totalOf(halfKey(s.toInning, s.toHalf));
    const fromTotal = totalOf(halfKey(s.fromInning, s.fromHalf));
    const end = toTotal ? base(s.toInning) + (3 * (s.toPa + 1)) / toTotal : coarse.end;
    if (s.fromPa === 0) return { start: coarse.start, end, midStart: false };
    if (fromTotal) return { start: coarse.start + (3 * s.fromPa) / fromTotal, end, midStart: false };
    return { start: coarse.start + 1.5, end, midStart: false }; // entered mid-half, half length unknown
  });

  for (let i = 1; i < spans.length; i++) {
    const prev = spans[i - 1];
    const cur = spans[i];
    if (prev.end > cur.start + 1e-9) {
      // `midStart` (coarse): cur starts on the inning boundary → meet in the middle.
      // Otherwise cur's entry point is already placed → cut exactly there.
      const cut = cur.midStart ? cur.start + 1.5 : cur.start;
      prev.end = Math.max(prev.start, cut);
      cur.start = cut;
    }
  }
  return spans.map(({ start, end }) => ({ start, end }));
}

export function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}
