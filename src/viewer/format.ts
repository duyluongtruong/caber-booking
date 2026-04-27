import type { LedgerRow } from "../ledger/types.js";

export type Tone = "warn" | "error" | "muted";
export type PinOrBadge =
  | { kind: "pin"; value: string; edited?: true }
  | { kind: "badge"; label: string; tone: Tone };

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateHeader(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return iso;
  // Example: "Mon · 27 Apr"
  const weekday = d.toLocaleDateString("en-AU", { weekday: "short" });
  const day = d.toLocaleDateString("en-AU", { day: "2-digit" });
  const month = d.toLocaleDateString("en-AU", { month: "short" });
  return `${weekday} · ${day} ${month}`;
}

export function pinOrBadge(row: LedgerRow): PinOrBadge {
  if (row.status === "confirmed") {
    if (row.accessCode) return { kind: "pin", value: row.accessCode };
    return { kind: "badge", label: "⚠ no PIN", tone: "warn" };
  }
  if (row.status === "manual_override") {
    if (row.accessCode) return { kind: "pin", value: row.accessCode, edited: true };
    return { kind: "badge", label: "⚠ no PIN", tone: "warn" };
  }
  if (row.status === "pending_pin") return { kind: "badge", label: "⏳ pending", tone: "warn" };
  if (row.status === "failed") return { kind: "badge", label: "⛔ failed", tone: "error" };
  if (row.status === "not_started") return { kind: "badge", label: "· queued", tone: "muted" };
  return { kind: "badge", label: String(row.status), tone: "muted" };
}
