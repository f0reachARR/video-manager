import type { User } from "../../../lib/api/client";

// Per-Run presence wire format. Each viewer emits ticks every PRESENCE_TICK_MS;
// receivers build a Map<senderId, Presence> from them. Stale entries
// (older than PRESENCE_STALE_MS) are pruned.
export type PresenceTick = {
  type: "presence.tick";
  senderId: string;
  userId: string | null;
  tSec: number;
  playing: boolean;
  isBroadcaster: boolean;
  // RunVideo.id of the angle the sender is currently viewing as "main".
  // Followers switch their own main angle to match.
  mainAngleId: string | null;
  ts: number;
};

export type Presence = {
  senderId: string;
  userId: string | null;
  tSec: number;
  playing: boolean;
  isBroadcaster: boolean;
  mainAngleId: string | null;
  ts: number;
  lastSeen: number;
};

export const PRESENCE_TICK_MS = 500;
export const PRESENCE_STALE_MS = 3000;

// Random per-tab id — distinguishes our own presence echoes from other viewers'.
export const SENDER_ID = `v_${Math.random().toString(36).slice(2, 10)}`;

// Deterministic fallback color when a presence has no associated user (or the
// user has no `color` field set).
function senderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(h) % 360} 70% 50%)`;
}

export function presenceColor(
  p: { userId: string | null; senderId: string },
  users: Map<string, User>,
): string {
  if (p.userId) {
    const u = users.get(p.userId);
    if (u?.color) return u.color;
  }
  return senderColor(p.senderId);
}

export function presenceLabel(
  p: { userId: string | null; senderId: string },
  users: Map<string, User>,
): string {
  if (p.userId) {
    const u = users.get(p.userId);
    if (u?.name) return u.name;
  }
  return `匿名 (${p.senderId.slice(-4)})`;
}
