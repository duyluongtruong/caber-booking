import type { LedgerFile, LedgerRow, LedgerStatus } from "./types.js";

const STATUSES: Readonly<Record<LedgerStatus, true>> = {
  not_started: true,
  pending_pin: true,
  confirmed: true,
  manual_override: true,
  failed: true,
};

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isLedgerRow(x: unknown): x is LedgerRow {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  if (!isString(r.sessionDate)) return false;
  if (!isString(r.courtLabel)) return false;
  if (!isString(r.start)) return false;
  if (!isString(r.end)) return false;
  if (!isString(r.accountId)) return false;
  if (!isNumber(r.jobSequence)) return false;
  if (!isString(r.status) || !(r.status in STATUSES)) return false;
  if (r.accessCode !== undefined && !isString(r.accessCode)) return false;
  if (r.bookingRef !== undefined && !isString(r.bookingRef)) return false;
  return true;
}

export function isLedgerFile(x: unknown): x is LedgerFile {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const root = x as Record<string, unknown>;
  const sessions = root.sessions;
  if (typeof sessions !== "object" || sessions === null || Array.isArray(sessions)) return false;
  for (const rows of Object.values(sessions as Record<string, unknown>)) {
    if (!Array.isArray(rows)) return false;
    for (const row of rows) if (!isLedgerRow(row)) return false;
  }
  return true;
}
