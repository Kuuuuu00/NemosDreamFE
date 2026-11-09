/**
 * Wording for the server's `li_percentile` (0–100): the share of league LI
 * situations BELOW this one (monotonic: higher LI → higher value; live samples:
 * LI 0.071→0, 0.74→40, 1.61→86).
 *  - p >= 50 → "리그 상위 (100−p)%"   (LI 1.61, p=86 → 상위 14%)
 *  - p <  50 → "리그 하위 p%"         (LI 0.17, p=4  → 하위 4%)
 * A 0 rounds up to 1 so the text never reads "0%".
 */
export function liPercentileLabel(p: number): string {
  return p >= 50 ? `리그 상위 ${Math.max(1, Math.round(100 - p))}%` : `리그 하위 ${Math.max(1, Math.round(p))}%`;
}
