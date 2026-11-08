import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionParams } from "@/context/SessionContext";
import type { ApiRequestError } from "@/api";

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
