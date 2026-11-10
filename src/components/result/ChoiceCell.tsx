interface ChoiceCellProps {
  name: string | null;
  /** true = replaced the pitcher, false = kept, null = unknown (past the divergence point). */
  isChange: boolean | null | undefined;
  rank: number | null;
}

/** One pitcher choice in the comparison: name + "모델 N위" (change) / "유지" tag (keep).
 * A change without a rank shows "—" (model gave no answer); no choice at all shows "—". */
export function ChoiceCell({ name, isChange, rank }: ChoiceCellProps) {
  if (!name || isChange === null || isChange === undefined) return <span>—</span>;
  const pill = "ml-1.5 rounded-full border border-border px-1.5 py-px text-[10px] leading-4";
  return (
    <span className="inline-flex items-center">
      {name}
      {!isChange ? (
        <span className={`${pill} text-muted-foreground`}>유지</span>
      ) : rank !== null ? (
        <span className={`${pill} text-primary`}>모델 {rank}위</span>
      ) : (
        <span className="ml-1.5 text-muted-foreground" title="모델 응답 없음" aria-label="모델 응답 없음">
          —
        </span>
      )}
    </span>
  );
}
