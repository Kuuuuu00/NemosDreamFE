import { useState } from "react";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  /** Absolute or same-origin URL from the adapter (`resolvePhotoUrl`); null = no photo. */
  photoUrl: string | null;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Round player photo with an initial fallback (no photo, or the image failed
 * to load). Callers pass `key={playerId}` so a stale image/error state never
 * carries over when the player changes.
 */
export function PlayerAvatar({ photoUrl, name, size = 72, className }: PlayerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground", className)}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={`${name} 사진`}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        // Fixed px (not responsive): the initial scales with the circle only.
        <span aria-hidden="true" style={{ fontSize: Math.round(size * 0.36) }}>
          {name.trim().charAt(0)}
        </span>
      )}
    </span>
  );
}
