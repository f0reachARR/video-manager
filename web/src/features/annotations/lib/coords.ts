// Shared pointer→normalized-coordinate helper. All annotation overlays
// use a 0..1 coordinate system in video space, computed from the
// overlay container's bounding rect.

export type NormalizedPoint = [number, number];

export function pointerToNormalized(
  el: HTMLElement | null,
  e: { clientX: number; clientY: number },
): NormalizedPoint | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return [x, y];
}
