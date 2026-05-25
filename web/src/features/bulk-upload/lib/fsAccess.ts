// Thin wrappers around the File System Access API. Chromium-only today;
// callers should check `isFsAccessSupported()` first and degrade gracefully
// (e.g. show an "unsupported browser" message).
//
// We deliberately don't auto-recurse into subdirectories: on-site we're
// pointed at a single SD-card folder, and walking arbitrary trees risks
// surprising the user with files outside their intent.

type FileWithHandle = {
  file: File;
  // Same-origin opaque key for dedup within one scan. Filename is good
  // enough for our use case since the FS Access listing comes back unique
  // per name within a directory.
  key: string;
};

export function isFsAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) return null;
  try {
    // The user gesture requirement is enforced by the browser; this throws
    // a NotAllowedError if invoked outside a click handler.
    const handle = await (window as unknown as {
      showDirectoryPicker: (opts: {
        id?: string;
        mode?: "read" | "readwrite";
      }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({
      // The "bulk-upload" id lets the browser remember the last-picked
      // location across visits — handy when the SD card is always mounted
      // at the same path.
      id: "soiree-bulk-upload",
      mode: "read",
    });
    return handle;
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return null;
    throw e;
  }
}

export async function listDirectoryFiles(
  dir: FileSystemDirectoryHandle,
): Promise<FileWithHandle[]> {
  const out: FileWithHandle[] = [];
  // `values()` is the supported iteration today; `entries()` returns the
  // same data but with the name pre-extracted. Prefer values for forward
  // compatibility.
  for await (const entry of (dir as unknown as {
    values: () => AsyncIterable<FileSystemHandle>;
  }).values()) {
    if (entry.kind !== "file") continue;
    try {
      const file = await (entry as FileSystemFileHandle).getFile();
      // Skip 0-byte placeholders the OS sometimes leaves behind.
      if (file.size === 0) continue;
      out.push({ file, key: entry.name });
    } catch {
      // Permission revoked or the file vanished between iteration and
      // getFile(). Skip silently; the user can re-scan.
    }
  }
  // Stable order so React keys don't churn on rescans.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}
