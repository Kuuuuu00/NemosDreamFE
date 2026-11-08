import type { ApiErrorCode } from "@/types/api";

/**
 * User-facing text per error `code`. The server's `message` is never shown:
 * it can be wrong for the call (INVALID_ROLE's text is written for
 * `recommend`) or carry internals (field names, ids). Branch on `code` only.
 */
export function apiErrorText(code: ApiErrorCode): string {
  switch (code) {
    case "NETWORK_ERROR":
      return "서버에 연결할 수 없습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.";
    case "MODEL_UNAVAILABLE":
      return "추천 모델이 응답하지 않습니다. 잠시 후 다시 시도해 주세요.";
    case "INTERNAL_ERROR":
      return "서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    case "SESSION_EXPIRED":
      return "세션이 만료되었습니다. 처음부터 다시 시작해 주세요.";
    case "GAME_NOT_FOUND":
      return "경기를 찾을 수 없습니다. 경기를 다시 선택해 주세요.";
    case "INVALID_ROLE":
      return "진행 단계가 서버와 맞지 않습니다. 화면을 새로고침하거나 새 경기를 시작해 주세요.";
    case "CANNOT_UNDO":
      return "되돌릴 수 있는 상태가 아닙니다.";
    case "NO_AVAILABLE_PITCHER":
      return "교체 가능한 투수가 없습니다. 현재 투수를 유지해 주세요.";
    case "INVALID_REQUEST":
      return "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
    case "ABORTED":
      return "";
  }
}
