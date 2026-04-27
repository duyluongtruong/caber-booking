import test from "node:test";
import assert from "node:assert/strict";
import { formatDateHeader, pinOrBadge, todayIso } from "../src/viewer/format.ts";
import type { LedgerRow } from "../src/ledger/types.ts";

function row(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    sessionDate: "2099-01-01",
    courtLabel: "Court 1",
    start: "19:30",
    end: "20:00",
    accountId: "acc",
    jobSequence: 1,
    status: "confirmed",
    accessCode: "1234",
    ...overrides,
  };
}

test("todayIso: returns YYYY-MM-DD in local TZ", () => {
  const iso = todayIso();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(iso, expected);
});

test("formatDateHeader: renders 'Mon · 27 Apr' style for a known date", () => {
  // 2099-04-27 is a Monday
  const out = formatDateHeader("2099-04-27");
  assert.match(out, /Mon/);
  assert.match(out, /27/);
  assert.match(out, /Apr/);
});

test("formatDateHeader: handles invalid input by returning the raw string", () => {
  assert.equal(formatDateHeader("not-a-date"), "not-a-date");
});

test("pinOrBadge: confirmed with accessCode → pin", () => {
  const r = row({ status: "confirmed", accessCode: "1234" });
  assert.deepEqual(pinOrBadge(r), { kind: "pin", value: "1234" });
});

test("pinOrBadge: manual_override with accessCode → pin with edited flag", () => {
  const r = row({ status: "manual_override", accessCode: "9999" });
  assert.deepEqual(pinOrBadge(r), { kind: "pin", value: "9999", edited: true });
});

test("pinOrBadge: confirmed with NO accessCode → warn 'no PIN'", () => {
  const r = row({ status: "confirmed", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⚠ no PIN", tone: "warn" });
});

test("pinOrBadge: pending_pin → warn 'pending'", () => {
  const r = row({ status: "pending_pin", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⏳ pending", tone: "warn" });
});

test("pinOrBadge: failed → error 'failed'", () => {
  const r = row({ status: "failed", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "⛔ failed", tone: "error" });
});

test("pinOrBadge: not_started → muted 'queued'", () => {
  const r = row({ status: "not_started", accessCode: undefined });
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "· queued", tone: "muted" });
});

test("pinOrBadge: unknown status → muted with raw label", () => {
  const r = { ...row({}), status: "weird" as unknown as LedgerRow["status"] };
  assert.deepEqual(pinOrBadge(r), { kind: "badge", label: "weird", tone: "muted" });
});
