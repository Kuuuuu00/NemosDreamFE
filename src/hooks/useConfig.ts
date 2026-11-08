import { useEffect, useState } from "react";
import { api } from "@/api";
import type { AppConfig } from "@/types/api";

/** `GET /config` is fetched once per page load and cached (spec §3-2) — never per session. */
let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

function loadConfig(): Promise<AppConfig> {
  inflight ??= api
    .getConfig()
    .then((c) => {
      cached = c;
      return c;
    })
    .catch((e) => {
      inflight = null; // allow a later retry
      throw e;
    });
  return inflight;
}

/** Returns `null` until loaded (or if it failed — callers fall back to no band labels). */
export function useConfig(): AppConfig | null {
  const [config, setConfig] = useState<AppConfig | null>(cached);

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    loadConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((e) => console.error("[useConfig]", e)); // TODO(3-3): surface via ErrorBanner
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
