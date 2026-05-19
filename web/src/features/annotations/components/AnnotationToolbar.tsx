// Shared toolbar for shape drawing modes (point / rect / arrow / text /
// liveInk) plus the optional label input. Used by AnnotatedPlayer
// (single-video page) and SyncPlayer (Run detail multi-angle player).

import { Button, TextInput } from "@mantine/core";

import { type DrawMode, modeHint } from "../lib/useShapeDrawing";

type ToolConfig = {
  mode: Exclude<DrawMode, "off">;
  label: string;
  color: string;
};

const TOOLS: ToolConfig[] = [
  { mode: "point", label: "📍 Point", color: "yellow" },
  { mode: "rect", label: "▭ Rect", color: "red" },
  { mode: "arrow", label: "➝ Arrow", color: "teal" },
  { mode: "text", label: "🅣 Text", color: "blue" },
  { mode: "liveInk", label: "✏️ ライブインク", color: "grape" },
];

const SHAPE_MODES: DrawMode[] = ["point", "rect", "arrow", "text"];

export function AnnotationToolbar({
  mode,
  onModeChange,
  label,
  onLabelChange,
  labelWidth = 200,
}: {
  mode: DrawMode;
  onModeChange: (mode: DrawMode) => void;
  label: string;
  onLabelChange: (value: string) => void;
  labelWidth?: number;
}) {
  const showLabelInput = SHAPE_MODES.includes(mode);
  const labelRequired = mode === "text";
  return (
    <>
      {TOOLS.map((t) => (
        <ToolButton
          key={t.mode}
          mode={t.mode}
          current={mode}
          label={t.label}
          color={t.color}
          onClick={onModeChange}
        />
      ))}
      {showLabelInput && (
        <TextInput
          size="xs"
          placeholder={labelRequired ? "テキスト (必須)" : "ラベル (任意)"}
          value={label}
          onChange={(e) => onLabelChange(e.currentTarget.value)}
          w={labelWidth}
          required={labelRequired}
        />
      )}
    </>
  );
}

function ToolButton({
  mode,
  current,
  label,
  onClick,
  color,
}: {
  mode: DrawMode;
  current: DrawMode;
  label: string;
  onClick: (m: DrawMode) => void;
  color: string;
}) {
  const active = current === mode;
  return (
    <Button
      size="xs"
      variant={active ? "filled" : "default"}
      color={active ? color : undefined}
      onClick={() => onClick(active ? "off" : mode)}
      title={modeHint(mode)}
    >
      {label}
    </Button>
  );
}
