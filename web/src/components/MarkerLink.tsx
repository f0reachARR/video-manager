import { Tooltip } from "@mantine/core";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useNavigate } from "@tanstack/react-router";

import type { Marker, MarkerCategory } from "../lib/api/client";
import { useMarker } from "../lib/queries";

declare module "@tiptap/core" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Commands<ReturnType> {
    markerLink: {
      insertMarkerLink: (markerId: string) => ReturnType;
    };
  }
}

/**
 * MarkerLink renders an inline chip referencing a Marker by id. The chip
 * resolves the marker via REST on render and shows "📍 m:ss label". Clicking
 * navigates to the Run detail page.
 *
 * Serialized form: <span data-marker-link data-marker-id="<uuid>" />
 */
export const MarkerLink = Node.create({
  name: "markerLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      markerId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-marker-id"),
        renderHTML: (attrs) =>
          attrs.markerId ? { "data-marker-id": attrs.markerId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-marker-link]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-marker-link": "true" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MarkerLinkChip);
  },

  addCommands() {
    return {
      insertMarkerLink:
        (markerId: string) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { markerId },
          }),
    };
  },
});

const categoryColor: Record<MarkerCategory, string> = {
  success: "var(--mantine-color-teal-6)",
  failure: "var(--mantine-color-red-6)",
  note: "var(--mantine-color-blue-6)",
};

function formatMarkerTime(offsetSec: number): string {
  const m = Math.floor(offsetSec / 60);
  const s = offsetSec - m * 60;
  return `${m}:${String(Math.floor(s)).padStart(2, "0")}`;
}

function MarkerLinkChip({ node }: NodeViewProps) {
  const id = node.attrs.markerId as string | null;
  const navigate = useNavigate();
  const q = useMarker(id);
  const marker: Marker | undefined = q.data;

  const onClick = () => {
    if (!marker) return;
    navigate({ to: "/runs/$runId", params: { runId: marker.runId } });
  };

  if (!id) {
    return (
      <NodeViewWrapper as="span" style={inlineStyle("gray", true)}>
        📍 (no marker)
      </NodeViewWrapper>
    );
  }
  if (q.isLoading) {
    return (
      <NodeViewWrapper as="span" style={inlineStyle("gray")}>
        📍 …
      </NodeViewWrapper>
    );
  }
  if (q.error || !marker) {
    return (
      <NodeViewWrapper as="span" style={inlineStyle("gray", true)}>
        📍 削除済み
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      onClick={onClick}
      style={inlineStyle(categoryColor[marker.category])}
    >
      <Tooltip label={marker.label || formatMarkerTime(marker.runOffsetSec)} withArrow>
        <span style={{ display: "inline-block" }}>
          📍 {formatMarkerTime(marker.runOffsetSec)}
          {marker.label && ` ${marker.label}`}
        </span>
      </Tooltip>
    </NodeViewWrapper>
  );
}

function inlineStyle(color: string, dim = false): React.CSSProperties {
  return {
    display: "inline-block",
    margin: "0 2px",
    padding: "1px 6px",
    fontSize: "0.85em",
    borderRadius: 4,
    color: dim ? "#888" : "#fff",
    background: dim ? "#eee" : color,
    cursor: dim ? "default" : "pointer",
    verticalAlign: "baseline",
    userSelect: "all",
  };
}
