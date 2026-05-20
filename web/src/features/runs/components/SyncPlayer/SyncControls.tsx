import { Badge, Button } from "@mantine/core";
import { useMemo } from "react";

import type { User } from "../../../../lib/api/client";
import { presenceColor, presenceLabel, type Presence } from "../../lib/presence";

export function SyncControls({
  presences,
  usersById,
  myBroadcasting,
  followTarget,
  onToggleBroadcast,
  onUnfollow,
}: {
  presences: Map<string, Presence>;
  usersById: Map<string, User>;
  myBroadcasting: boolean;
  followTarget: string | null;
  onToggleBroadcast: () => void;
  onUnfollow: () => void;
}) {
  // The "current broadcaster" is whoever among visible presences has
  // isBroadcaster=true. If nobody, the slot is free.
  const currentBroadcaster = useMemo(() => {
    for (const p of presences.values()) {
      if (p.isBroadcaster) return p;
    }
    return null;
  }, [presences]);

  const someoneElseBroadcasting =
    currentBroadcaster !== null && !myBroadcasting;
  const followedPresence = followTarget ? presences.get(followTarget) : null;

  return (
    <>
      <Button
        size="xs"
        variant={myBroadcasting ? "filled" : "default"}
        color={myBroadcasting ? "blue" : undefined}
        onClick={onToggleBroadcast}
      >
        {myBroadcasting
          ? "🛰 自分に追従中 (停止)"
          : someoneElseBroadcasting
            ? "🛰 自分に追従させる (奪う)"
            : "🛰 全員に追従させる"}
      </Button>
      {someoneElseBroadcasting && currentBroadcaster && (
        <Badge
          size="xs"
          color="blue"
          variant="dot"
          style={{
            background: presenceColor(currentBroadcaster, usersById),
            color: "#fff",
          }}
        >
          {presenceLabel(currentBroadcaster, usersById)} に全員追従中
        </Badge>
      )}
      {followedPresence && !myBroadcasting && (
        <Badge
          size="xs"
          color="cyan"
          variant="light"
          rightSection={
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={onUnfollow}
              style={{ marginLeft: 4 }}
            >
              ×
            </Button>
          }
        >
          {presenceLabel(followedPresence, usersById)} を追従中
        </Badge>
      )}
    </>
  );
}
