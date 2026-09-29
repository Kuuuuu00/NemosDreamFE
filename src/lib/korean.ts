/** Appends 으로/로 to a Korean (or non-Korean) name based on whether its
 * last syllable has a trailing consonant (받침). No 받침, or a ㄹ 받침,
 * takes 로; every other 받침 takes 으로. Non-Hangul names fall back to 으로. */
export function withParticle(name: string): string {
  const last = name.charCodeAt(name.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${name}으로`;
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? `${name}로` : `${name}으로`;
}
