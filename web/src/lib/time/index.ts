// Compact datetime formatters tuned for the Run UI where we frequently show
// timestamps inline. Default `toLocaleString()` produces verbose output that
// also varies by locale; these helpers always use the Japanese-style
// "Y/M/D H:M:S" ordering (slashes, 24h), trim the date parts when same-day
// / same-year, and append a 1/100s fractional tail when the value isn't a
// whole second.

const pad = (n: number, w = 2) => n.toString().padStart(w, "0");

/**
 * `HH:MM:SS` (and `.ss` when the value has sub-second precision). Used as the
 * tail of every multi-component formatter; exported in case a caller wants
 * just the clock part.
 */
export function formatClock(d: Date): string {
  const ms = d.getMilliseconds();
  const tail = ms > 0 ? `.${pad(Math.floor(ms / 10))}` : "";
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${tail}`;
}

/**
 * Compact label for inline display:
 * - same day as `now` → `HH:MM:SS[.ss]`
 * - same year         → `M/D HH:MM:SS[.ss]`
 * - otherwise         → `Y/M/D HH:MM:SS[.ss]`
 *
 * `now` can be passed for deterministic output (tests etc.).
 */
export function formatDateTimeShort(d: Date | string | number, now = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  const sameYear = dt.getFullYear() === now.getFullYear();
  const time = formatClock(dt);
  if (sameDay) return time;
  if (sameYear) return `${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
}

/** Always-full `Y/M/D HH:MM:SS[.ss]` — for tooltips that need to be unambiguous. */
export function formatDateTimeFull(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${formatClock(dt)}`;
}

// Backwards-compat alias — older code referenced this name.
export const formatDateTimeWithSeconds = formatDateTimeFull;
