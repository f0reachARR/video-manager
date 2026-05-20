import type { User } from "../../../../lib/api/client";
import { presenceColor, presenceLabel, type Presence } from "../../lib/presence";
import { formatTime } from "../../lib/format";

// Row of clickable dots above the playback slider, one per other viewer.
// Clicking a dot toggles "follow this viewer". Broadcasters get a larger
// dot with a colored halo.
export function PresenceStrip({
  presences,
  usersById,
  durationSec,
  followTarget,
  onToggleFollow,
}: {
  presences: Map<string, Presence>;
  usersById: Map<string, User>;
  durationSec: number;
  followTarget: string | null;
  onToggleFollow: (senderId: string | null) => void;
}) {
  if (durationSec <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: -18,
        height: 16,
      }}
    >
      {[...presences.values()].map((p) => {
        const pct = Math.max(
          0,
          Math.min(100, (p.tSec / durationSec) * 100),
        );
        const color = presenceColor(p, usersById);
        const name = presenceLabel(p, usersById);
        const isFollowed = followTarget === p.senderId;
        return (
          <button
            type="button"
            key={p.senderId}
            onClick={() => onToggleFollow(isFollowed ? null : p.senderId)}
            title={`${name} — ${formatTime(p.tSec)}${p.isBroadcaster ? " (全員に追従させ中)" : ""}${isFollowed ? "（追従中。クリックで解除）" : "（クリックで追従）"}`}
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: 0,
              transform: "translateX(-50%)",
              width: p.isBroadcaster ? 16 : 12,
              height: p.isBroadcaster ? 16 : 12,
              borderRadius: "50%",
              background: color,
              border: isFollowed
                ? "2px solid #fff"
                : p.isBroadcaster
                  ? "2px solid #fff"
                  : "1px solid rgba(255,255,255,0.7)",
              boxShadow: p.isBroadcaster
                ? `0 0 0 2px ${color}`
                : "0 0 0 1px rgba(0,0,0,0.3)",
              cursor: "pointer",
              padding: 0,
            }}
            aria-label={`follow ${name}`}
          />
        );
      })}
    </div>
  );
}
