import type { LedgerFile, LedgerRow } from "../ledger/types.js";

export function rowsForDate(file: LedgerFile | null, date: string): LedgerRow[] {
  if (!file) return [];
  return file.sessions[date] ?? [];
}

export function distinctCourts(rows: readonly LedgerRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) set.add(r.courtLabel);
  return [...set].sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

export function filterByCourt(
  rows: readonly LedgerRow[],
  court: string | null,
): LedgerRow[] {
  if (court === null) return [...rows];
  return rows.filter((r) => r.courtLabel === court);
}

export function sortRowsForDisplay(rows: readonly LedgerRow[]): LedgerRow[] {
  return [...rows].sort((a, b) => {
    const c = a.courtLabel.localeCompare(b.courtLabel, "en", { numeric: true });
    if (c !== 0) return c;
    return a.start.localeCompare(b.start);
  });
}

export type CourtGroup = { courtLabel: string; rows: LedgerRow[] };

export function groupByCourt(rows: readonly LedgerRow[]): CourtGroup[] {
  const groups: CourtGroup[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.courtLabel === r.courtLabel) {
      last.rows.push(r);
    } else {
      groups.push({ courtLabel: r.courtLabel, rows: [r] });
    }
  }
  return groups;
}
