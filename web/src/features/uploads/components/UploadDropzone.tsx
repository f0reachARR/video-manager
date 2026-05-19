import { Paper, Text } from "@mantine/core";
import { useState } from "react";

export function UploadDropzone({
  onFiles,
}: {
  onFiles: (files: FileList) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <Paper
      withBorder
      p="lg"
      style={{
        borderStyle: "dashed",
        background: dragging ? "var(--mantine-color-blue-0)" : undefined,
        transition: "background 120ms",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      <Text ta="center" c={dragging ? "blue" : "dimmed"}>
        動画ファイルをここにドラッグ&ドロップ
      </Text>
    </Paper>
  );
}
