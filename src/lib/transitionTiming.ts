/**
 * Pacing for a half-ending PA: ① result effect → ② hold → ③ offense overlay.
 * The effect's own length is NOT configured here — `OutcomeEffect` reports
 * when its CSS animations actually finish — so changing the effect never
 * desynchronizes this sequence.
 */

/** ② How long the finished result stays readable before the offense overlay. */
export const HOLD_AFTER_EFFECT_MS = 800;
/** ② when the user prefers reduced motion. */
export const HOLD_AFTER_EFFECT_REDUCED_MS = 300;
/** The offense overlay can't be dismissed (click-skip) earlier than this after it appears. */
export const MIN_OFFENSE_OVERLAY_MS = 2000;
/** Safety net only: if the effect never reports completion (e.g. a throttled background tab), continue anyway. */
export const EFFECT_SAFETY_MS = 6000;

export function holdAfterEffectMs(): number {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return reduced ? HOLD_AFTER_EFFECT_REDUCED_MS : HOLD_AFTER_EFFECT_MS;
}

/** The offense overlay fades in over ~300ms (6% of its 5s timeline). Everything that re-renders the
 * dashboard underneath (state release, we-trace / usage / recommend results) waits this long so the
 * heavy React commits don't land inside the appear animation. */
export const OVERLAY_SETTLE_MS = 450;
