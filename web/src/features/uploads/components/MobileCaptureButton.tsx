import { Button } from "@mantine/core";
import { useRef } from "react";

// "撮影" picker for phones — uses `capture="environment"` so the OS opens
// the camera directly instead of the file picker. Hidden <input> behind a
// styled Button keeps the visual consistent with the other upload actions.
export function MobileCaptureButton({
  onPicked,
}: {
  onPicked: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onPicked(f);
          e.currentTarget.value = "";
        }}
      />
      <Button variant="default" onClick={() => inputRef.current?.click()}>
        📷 撮影
      </Button>
    </>
  );
}
