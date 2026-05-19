import { useEffect, useRef, useState } from "react";

import { useWebSocketPublisher } from "../../../lib/realtime";
import {
  PRESENCE_STALE_MS,
  PRESENCE_TICK_MS,
  type Presence,
  type PresenceTick,
  SENDER_ID,
} from "../lib/presence";

export type LocalPresenceSnapshot = {
  userId: string | null;
  tSec: number;
  playing: boolean;
  mainAngleId: string | null;
};

export type RemoteFollowTick = {
  tSec: number;
  playing: boolean;
  mainAngleId: string | null;
  ts: number;
};

export type UsePresenceArgs = {
  runId: string;
  // Read the local state we should publish; consulted via ref so the
  // long-lived WS handler closure sees the latest snapshot without
  // re-subscribing.
  getLocalSnapshot: () => LocalPresenceSnapshot;
  // Called whenever the currently-followed presence emits a tick, so the
  // player can steer playback (seek + play/pause + switch main angle) to
  // match. Implementation is read via ref so updates don't reset the WS.
  onFollowTick: (tick: RemoteFollowTick) => void;
};

export type UsePresenceResult = {
  presences: Map<string, Presence>;
  myBroadcasting: boolean;
  setMyBroadcasting: (next: boolean) => void;
  followTarget: string | null;
  followIndividual: (senderId: string | null) => void;
  // Emit a presence tick immediately (e.g. right after a local state change
  // so other viewers see it without waiting for the next periodic tick).
  broadcastNow: () => void;
};

// Manages presence WS connection + follow logic for a Run viewer.
//
// The hook keeps a Map<senderId, Presence> of remote viewers seen recently
// (pruned at PRESENCE_STALE_MS), publishes our own tick every
// PRESENCE_TICK_MS, and tracks two kinds of "follow" state:
//   - "broadcaster": auto-set when someone else claims the broadcast slot;
//                    auto-releases when they release it.
//   - "individual":  set by the user clicking a presence dot; sticks until
//                    cleared explicitly or the target disappears.
export function usePresence({
  runId,
  getLocalSnapshot,
  onFollowTick,
}: UsePresenceArgs): UsePresenceResult {
  const [presences, setPresences] = useState<Map<string, Presence>>(new Map());
  const [myBroadcasting, setMyBroadcastingState] = useState(false);
  const [followTarget, setFollowTarget] = useState<string | null>(null);

  // followModeRef: "broadcaster" means the follow was auto-set because
  // someone else claimed the slot — auto-release when they release.
  // "individual" means the viewer explicitly chose to track this person —
  // sticks until cleared.
  const followModeRef = useRef<"broadcaster" | "individual" | null>(null);

  // Refs mirror React state so the long-lived WS handler closure can read
  // current values without re-subscribing.
  const myBroadcastingRef = useRef(false);
  myBroadcastingRef.current = myBroadcasting;
  const followTargetRef = useRef<string | null>(null);
  followTargetRef.current = followTarget;
  const snapshotRef = useRef(getLocalSnapshot);
  snapshotRef.current = getLocalSnapshot;
  const onFollowTickRef = useRef(onFollowTick);
  onFollowTickRef.current = onFollowTick;

  // Tracks who is currently broadcasting so we can detect "new claim" vs
  // "continuing" ticks. Updated from the WS handler.
  const broadcasterRef = useRef<string | null>(null);

  const publishPresence = useWebSocketPublisher(`/ws/run/${runId}`, (msg) => {
    const m = msg as Partial<PresenceTick> & { type?: string };
    if (m.type !== "presence.tick") return;
    if (typeof m.senderId !== "string" || m.senderId === SENDER_ID) return;
    if (typeof m.tSec !== "number" || typeof m.playing !== "boolean") return;
    const tick: Presence = {
      senderId: m.senderId,
      userId: m.userId ?? null,
      tSec: m.tSec,
      playing: m.playing,
      isBroadcaster: !!m.isBroadcaster,
      mainAngleId: typeof m.mainAngleId === "string" ? m.mainAngleId : null,
      ts: typeof m.ts === "number" ? m.ts : Date.now(),
      lastSeen: Date.now(),
    };
    setPresences((prev) => {
      const next = new Map(prev);
      next.set(tick.senderId, tick);
      return next;
    });

    // Broadcaster transitions (new claim / release).
    if (tick.isBroadcaster) {
      if (broadcasterRef.current !== tick.senderId) {
        // Someone (else) just claimed the slot.
        broadcasterRef.current = tick.senderId;
        // Yield if we were claiming too — last-write-wins.
        if (myBroadcastingRef.current) setMyBroadcastingState(false);
        // Auto-follow the new broadcaster.
        followModeRef.current = "broadcaster";
        setFollowTarget(tick.senderId);
      }
    } else if (broadcasterRef.current === tick.senderId) {
      // The previous broadcaster has released.
      broadcasterRef.current = null;
      if (
        followModeRef.current === "broadcaster" &&
        followTargetRef.current === tick.senderId
      ) {
        followModeRef.current = null;
        setFollowTarget(null);
      }
    }

    // If we're following this sender, nudge our playback + main angle.
    if (followTargetRef.current === tick.senderId) {
      onFollowTickRef.current({
        tSec: tick.tSec,
        playing: tick.playing,
        mainAngleId: tick.mainAngleId,
        ts: tick.ts,
      });
    }
  });

  const broadcastNow = () => {
    const snap = snapshotRef.current();
    publishPresence({
      type: "presence.tick",
      senderId: SENDER_ID,
      userId: snap.userId,
      tSec: snap.tSec,
      playing: snap.playing,
      isBroadcaster: myBroadcastingRef.current,
      mainAngleId: snap.mainAngleId,
      ts: Date.now(),
    } satisfies PresenceTick);
  };

  // Periodic presence emission — always on, not just while playing, so other
  // viewers know our position when paused too.
  useEffect(() => {
    const id = setInterval(broadcastNow, PRESENCE_TICK_MS);
    return () => clearInterval(id);
    // broadcastNow reads everything via refs; safe to depend on nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prune stale presence entries.
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - PRESENCE_STALE_MS;
      setPresences((prev) => {
        let dirty = false;
        const next = new Map(prev);
        for (const [k, v] of next) {
          if (v.lastSeen < cutoff) {
            next.delete(k);
            dirty = true;
          }
        }
        return dirty ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // If the user we were following disappeared from `presences`, drop follow.
  useEffect(() => {
    if (!followTarget) return;
    if (!presences.has(followTarget)) {
      followModeRef.current = null;
      setFollowTarget(null);
      if (broadcasterRef.current === followTarget) {
        broadcasterRef.current = null;
      }
    }
  }, [followTarget, presences]);

  const setMyBroadcasting = (next: boolean) => {
    setMyBroadcastingState(next);
    myBroadcastingRef.current = next;
    if (next) {
      // We're claiming the slot — drop any prior follow target.
      followModeRef.current = null;
      setFollowTarget(null);
      broadcasterRef.current = SENDER_ID;
    } else if (broadcasterRef.current === SENDER_ID) {
      broadcasterRef.current = null;
    }
    broadcastNow();
  };

  const followIndividual = (senderId: string | null) => {
    if (senderId === null) {
      followModeRef.current = null;
      setFollowTarget(null);
      return;
    }
    followModeRef.current = "individual";
    setFollowTarget(senderId);
  };

  return {
    presences,
    myBroadcasting,
    setMyBroadcasting,
    followTarget,
    followIndividual,
    broadcastNow,
  };
}
