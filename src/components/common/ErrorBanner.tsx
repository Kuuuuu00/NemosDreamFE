import { Button } from "@/components/ui/button";
import { apiErrorText } from "@/lib/apiErrorText";
import { cn } from "@/lib/utils";
import type { ApiRequestError } from "@/api";

interface ErrorBannerProps {
  error: ApiRequestError;
  /** Shown only for `recoverable` errors (the server's `recoverable` flag; NETWORK_ERROR is always recoverable). */
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline error banner (shown in place, no toast). Text comes from the error
 * `code` (`apiErrorText`); the server `message` is deliberately not displayed.
 * A retry button appears only when the error is recoverable.
 */
export function ErrorBanner({ error, onRetry, onDismiss, className }: ErrorBannerProps) {
  const canRetry = error.recoverable && !!onRetry;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-sm",
        className,
      )}
      style={{ borderColor: "var(--destructive)", background: "color-mix(in srgb, var(--destructive) 10%, transparent)" }}
    >
      <span className="min-w-0">{apiErrorText(error.code)}</span>
      <div className="flex shrink-0 items-center gap-2">
        {canRetry && (
          <Button variant="muted" size="sm" onClick={onRetry}>
            다시 시도
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            닫기
          </Button>
        )}
      </div>
    </div>
  );
}
