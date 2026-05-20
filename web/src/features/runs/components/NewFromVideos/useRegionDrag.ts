import { useRef } from "react";

import { LABEL_GUTTER, newRegionId, type Region } from "./types";

type DragKind = "create" | "move" | "resize-start" | "resize-end";

type DragState = {
  kind: DragKind;
  regionId: string;
  startSec: number;
  initStart: number;
  initEnd: number;
};

// Bundle pointer-drag handling for the timeline: creating a region by
// dragging on empty space, moving an existing one, and resizing from either
// edge. Kept in one hook so the shared dragRef and xToSec math live next to
// the handlers that read them.
export function useRegionDrag({
  trackRef,
  totalSec,
  placeableCount,
  defaults,
  setRegions,
  setSelectedId,
}: {
  trackRef: React.RefObject<HTMLDivElement | null>;
  totalSec: number;
  placeableCount: number;
  defaults: {
    teamId: string | null;
    robotId: string | null;
    scenarioId: string | null;
  };
  setRegions: React.Dispatch<React.SetStateAction<Region[]>>;
  setSelectedId: (id: string | null) => void;
}) {
  const dragRef = useRef<DragState | null>(null);

  const xToSec = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - LABEL_GUTTER;
    const w = Math.max(1, rect.width - LABEL_GUTTER);
    return (px / w) * totalSec;
  };

  const startTrackDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (placeableCount === 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sec = Math.max(0, Math.min(totalSec, xToSec(e.clientX, rect)));
    const id = newRegionId();
    setRegions((rs) => [
      ...rs,
      {
        id,
        startSec: sec,
        endSec: sec,
        teamId: defaults.teamId,
        robotId: defaults.robotId,
        scenarioId: defaults.scenarioId,
        memo: "",
        score: "",
      },
    ]);
    setSelectedId(id);
    dragRef.current = {
      kind: "create",
      regionId: id,
      startSec: sec,
      initStart: sec,
      initEnd: sec,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const startRegionDrag =
    (region: Region, kind: "move" | "resize-start" | "resize-end") =>
    (e: React.PointerEvent) => {
      e.stopPropagation();
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSelectedId(region.id);
      dragRef.current = {
        kind,
        regionId: region.id,
        startSec: xToSec(e.clientX, rect),
        initStart: region.startSec,
        initEnd: region.endSec,
      };
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cur = Math.max(0, Math.min(totalSec, xToSec(e.clientX, rect)));
    setRegions((rs) =>
      rs.map((r) => {
        if (r.id !== drag.regionId) return r;
        let s = drag.initStart;
        let eEnd = drag.initEnd;
        if (drag.kind === "create") {
          s = Math.min(drag.startSec, cur);
          eEnd = Math.max(drag.startSec, cur);
        } else if (drag.kind === "move") {
          const dx = cur - drag.startSec;
          const len = drag.initEnd - drag.initStart;
          s = Math.max(0, Math.min(totalSec - len, drag.initStart + dx));
          eEnd = s + len;
        } else if (drag.kind === "resize-start") {
          s = Math.max(0, Math.min(drag.initEnd - 0.1, cur));
          eEnd = drag.initEnd;
        } else if (drag.kind === "resize-end") {
          s = drag.initStart;
          eEnd = Math.max(drag.initStart + 0.1, Math.min(totalSec, cur));
        }
        return { ...r, startSec: s, endSec: eEnd };
      }),
    );
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "create") {
      // Tossing off a click without any movement creates a zero-length
      // region; drop those so the table doesn't fill with phantom rows.
      setRegions((rs) =>
        rs.filter(
          (r) => r.id !== drag.regionId || r.endSec - r.startSec >= 0.5,
        ),
      );
    }
  };

  return { startTrackDrag, startRegionDrag, onPointerMove, endDrag };
}
