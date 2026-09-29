import type { AppConfig } from "@/types/api";

/** Mirrors `GET /config` (§3-1). Swap for a real fetch once the backend
 * publishes `config/li_baseline.json`. */
export const APP_CONFIG: AppConfig = {
  leverage: {
    leagueAvg: 1.0,
    max: 4.0,
    bands: [
      { label: "저", min: 0, max: 0.85 },
      { label: "중", min: 0.85, max: 1.5 },
      { label: "고", min: 1.5, max: 3.0 },
      { label: "매우 높음", min: 3.0, max: 4.0 },
    ],
  },
  qualityP: { min: 0, max: 1, description: "투수 품질 지수 (CatBoost 산출, 정규화)" },
};
