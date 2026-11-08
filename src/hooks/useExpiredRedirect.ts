import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSessionParams } from "@/context/SessionContext";
import { ApiRequestError } from "@/api";

/**
 * SESSION_EXPIRED (server session gone after 30 idle minutes, or the stored
 * session info can't be rebuilt): drop the stored session and go back to
 * onboarding with a notice. Nothing else is recoverable from this error.
 */
export function useExpiredRedirect(error: ApiRequestError | null): void {
  const navigate = useNavigate();
  const { clear } = useSessionParams();
  const expired = error?.code === "SESSION_EXPIRED";
  useEffect(() => {
    if (!expired) return;
    clear();
    navigate("/", { replace: true, state: { notice: "SESSION_EXPIRED" } });
  }, [expired, clear, navigate]);
}

/**
 * Onboarding side of the redirect above: a dismissible "session expired"
 * notice (an `ApiRequestError` for `ErrorBanner`) when we arrive from one.
 */
export function useExpiredNotice(): { error: ApiRequestError | null; dismiss: () => void } {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const error = useMemo(() => new ApiRequestError("SESSION_EXPIRED", "", false), []);
  const fromExpired = (location.state as { notice?: string } | null)?.notice === "SESSION_EXPIRED";
  return { error: fromExpired && !dismissed ? error : null, dismiss: () => setDismissed(true) };
}
