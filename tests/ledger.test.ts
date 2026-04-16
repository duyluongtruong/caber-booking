import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { LedgerStore } from "../src/ledger/store.ts";
import type { PlannedJob } from "../src/planner/types.ts";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tennis-ledger-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ledger: upsert from three jobs, set PIN, export markdown contains codes", () => {
  withTempDir((dir) => {
    const filePath = path.join(dir, "ledger.json");
    const store = new LedgerStore(filePath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "acc-a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 2,
        accountId: "acc-b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 3,
        accountId: "acc-c",
        courtLabel: "Court 3",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];

    store.upsertFromPlannedJobs(jobs);
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 3);
    assert.equal(rows.every((r) => r.status === "not_started"), true);

    store.updateRow(sessionDate, 3, { accessCode: "0782", status: "confirmed" });
    const md = store.exportMarkdown(sessionDate);
    assert.match(md, /Court 3/);
    assert.match(md, /0782/);
    assert.match(md, /confirmed/);
  });
});

test("ledger: updateRow throws for unknown session or sequence", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    assert.throws(() => store.updateRow("2099-01-01", 1, { accessCode: "x" }), /No ledger session/);
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate: "2026-01-01",
      },
    ]);
    assert.throws(() => store.updateRow("2026-01-01", 99, { accessCode: "x" }), /No row with jobSequence/);
  });
});

test("ledger: upsertFromPlannedJobs rejects mixed session dates", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    assert.throws(
      () =>
        store.upsertFromPlannedJobs([
          {
            sequence: 1,
            accountId: "a",
            courtLabel: "Court 1",
            start: "19:30",
            end: "21:30",
            sessionDate: "2026-01-01",
          },
          {
            sequence: 2,
            accountId: "b",
            courtLabel: "Court 2",
            start: "19:30",
            end: "21:30",
            sessionDate: "2026-01-02",
          },
        ]),
      /same sessionDate/,
    );
  });
});

test("ledger: second upsert for same date different court/time merges, does not wipe prior rows", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    const sessionDate = "2026-06-02";
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "acc-a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "acc-b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 2);
    const court1 = rows.find((r) => r.courtLabel === "Court 1");
    const court2 = rows.find((r) => r.courtLabel === "Court 2");
    assert.ok(court1);
    assert.ok(court2);
    assert.equal(court1.accountId, "acc-a");
    assert.equal(court2.accountId, "acc-b");
  });
});

test("ledger: upsert same court/time same account preserves status and accessCode", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    const sessionDate = "2026-06-03";
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "acc-a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    store.updateRow(sessionDate, 1, { accessCode: "4242", status: "confirmed", bookingRef: "bk-1" });
    store.upsertFromPlannedJobs([
      {
        sequence: 2,
        accountId: "acc-a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].jobSequence, 2);
    assert.equal(rows[0].status, "confirmed");
    assert.equal(rows[0].accessCode, "4242");
    assert.equal(rows[0].bookingRef, "bk-1");
  });
});

test("ledger: upsert same court/time different account resets status and accessCode", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    const sessionDate = "2026-06-04";
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "acc-a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    store.updateRow(sessionDate, 1, { accessCode: "9999", status: "confirmed", bookingRef: "old-ref" });
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "acc-b",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].accountId, "acc-b");
    assert.equal(rows[0].status, "not_started");
    assert.equal(rows[0].accessCode, undefined);
    assert.equal(rows[0].bookingRef, undefined);
  });
});
