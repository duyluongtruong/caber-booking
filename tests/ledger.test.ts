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
        start: "07:30",
        end: "09:30",
        sessionDate,
      },
      {
        sequence: 2,
        accountId: "acc-b",
        courtLabel: "Court 2",
        start: "07:30",
        end: "09:30",
        sessionDate,
      },
      {
        sequence: 3,
        accountId: "acc-c",
        courtLabel: "Court 3",
        start: "07:30",
        end: "09:30",
        sessionDate,
      },
    ];

    store.upsertFromPlannedJobs(jobs);
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 3);
    assert.equal(rows.every((r) => r.status === "pending_pin"), true);

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
        start: "07:30",
        end: "09:30",
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
            start: "07:30",
            end: "09:30",
            sessionDate: "2026-01-01",
          },
          {
            sequence: 2,
            accountId: "b",
            courtLabel: "Court 2",
            start: "07:30",
            end: "09:30",
            sessionDate: "2026-01-02",
          },
        ]),
      /same sessionDate/,
    );
  });
});
