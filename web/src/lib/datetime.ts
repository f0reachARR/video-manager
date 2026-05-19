// Compact datetime formatters tuned for the Run UI where we frequently show
// timestamps inline. Default `toLocaleString()` produces verbose output like
// "2026/5/19 14:32:01" — too long for table cells / chips. These helpers drop
// redundant parts depending on how close the value is to "now".

const pad = (n: number) => n.toString().padStart(2, "0");

/**
 * Returns a short label suitable for a single-line table cell:
 * - same day → "HH:MM"
 * - same year → "M/D HH:MM"
 * - otherwise → "YYYY/M/D HH:MM"
 *
 * Pass the now reference if you need deterministic output (tests etc.).
 */
export function formatDateTimeShort(d: Date | string | number, now = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  const sameYear = dt.getFullYear() === now.getFullYear();
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  if (sameDay) return time;
  if (sameYear) return `${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
}

/** Variant that includes seconds when needed (e.g. tooltips). */
export function formatDateTimeWithSeconds(d: Date | string | number, now = new Date()): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const sameDay =
    dt.getFullYear() === now.getFullYear() &&
    dt.getMonth() === now.getMonth() &&
    dt.getDate() === now.getDate();
  const sameYear = dt.getFullYear() === now.getFullYear();
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  if (sameDay) return time;
  if (sameYear) return `${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
  return `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()} ${time}`;
}
