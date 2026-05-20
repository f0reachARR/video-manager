// Head-hash spec must match the backend: SHA-256 of the first 1 MiB of the
// file, hex-encoded. Changing the window size means existing fingerprints
// no longer match — bump this only intentionally.
export const HEAD_HASH_BYTES = 1 << 20;

export async function hashHeadHex(file: File): Promise<string> {
  const slice = file.slice(0, Math.min(file.size, HEAD_HASH_BYTES));
  const buf = await slice.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(arr: Uint8Array): string {
  const hex = new Array<string>(arr.length);
  for (let i = 0; i < arr.length; i++) {
    hex[i] = arr[i].toString(16).padStart(2, "0");
  }
  return hex.join("");
}
