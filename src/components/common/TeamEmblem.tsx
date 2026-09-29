import { useState } from "react";
import { cn } from "@/lib/utils";

// public/emblem/*.png is named after legacy KBO team codes, which diverge
// from this app's team codes (see src/mocks/teams.ts) for two teams:
// KIA's file is HT (해태 lineage) and SSG's file is SK (SK 와이번스 lineage).
const EMBLEM_FILE_CODE: Record<string, string> = {
  KIA: "HT",
  SSG: "SK",
};

function emblemSrc(code: string): string {
  return `/emblem/${EMBLEM_FILE_CODE[code] ?? code}.png`;
}

interface TeamEmblemProps {
  code: string;
  name?: string;
  size?: number;
  className?: string;
  /** White circular backdrop + 1px border, for dark-heavy emblems on dark backgrounds. */
  ring?: boolean;
}

export function TeamEmblem({ code, name, size = 32, className, ring = false }: TeamEmblemProps) {
  const [failed, setFailed] = useState(false);
  const alt = name ? `${name} 엠블럼` : "";

  if (failed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
        role={name ? "img" : undefined}
        aria-label={name ? alt : undefined}
        aria-hidden={name ? undefined : true}
      >
        {code.charAt(0)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        ring && "bg-white ring-1 ring-border",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/*
        Emblem PNGs are square (~961x961) with the team mark already drawn
        on a white disc inscribed in the canvas (disc radius == half the
        canvas side, touching all 4 edge midpoints). So sizing the <img> to
        100% makes that disc exactly fill the circular frame, with no
        clipping risk since every mark sits inside its own disc.
      */}
      <img
        src={emblemSrc(code)}
        alt={alt}
        aria-hidden={name ? undefined : true}
        className="object-contain"
        style={{ width: "100%", height: "100%" }}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
