/**
 * Session dates for “Monday night” bookings in the machine local timezone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Next Monday on or after `base`’s calendar day (if `base` is Monday, use that day). */
export function upcomingMonday(base: Date = new Date()): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = d.getDay();
  const delta = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  d.setDate(d.getDate() + delta);
  return d;
}

/** `upcomingMonday` + `weeksAhead * 7` calendar days. */
export function mondayWeeksAhead(weeksAhead: number, base: Date = new Date()): Date {
  if (!Number.isInteger(weeksAhead) || weeksAhead < 0) {
    throw new Error(`weeksAhead must be a non-negative integer, got ${weeksAhead}`);
  }
  const d = upcomingMonday(base);
  d.setDate(d.getDate() + weeksAhead * 7);
  return d;
}

export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayWeeksAheadIso(weeksAhead: number, base: Date = new Date()): string {
  return formatLocalIsoDate(mondayWeeksAhead(weeksAhead, base));
}

export function assertIsoDate(s: string): string {
  const m = ISO_DATE.exec(s);
  if (!m) throw new Error(`Invalid date (use YYYY-MM-DD): ${s}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    throw new Error(`Invalid calendar date: ${s}`);
  }
  return s;
}

/**
 * Resolve CLI session date: explicit `--date` wins; else Monday `--weeks` ahead (default 0).
 */
export function resolveSessionDate(opts: { date?: string; weeks?: number }): string {
  if (opts.date !== undefined && opts.date.length > 0) {
    return assertIsoDate(opts.date);
  }
  const w = opts.weeks ?? 0;
  if (typeof w !== "number" || !Number.isInteger(w) || w < 0) {
    throw new Error("--weeks must be a non-negative integer");
  }
  return mondayWeeksAheadIso(w);
}
