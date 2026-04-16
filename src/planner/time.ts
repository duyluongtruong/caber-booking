export function timeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) throw new Error(`Invalid time (expected HH:mm): ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${t}`);
  return h * 60 + min;
}

export function minutesToHHmm(totalMinutes: number): string {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) {
    throw new Error(`Invalid minutes since midnight: ${totalMinutes}`);
  }
  const h = Math.floor(totalMinutes / 60);
  const min = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
