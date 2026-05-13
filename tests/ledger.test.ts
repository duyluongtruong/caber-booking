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

// --- countActiveBookingsByAccount ---

test("countActiveBookingsByAccount: confirmed/pending_pin/manual_override count, others don't", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-01" },
      { sequence: 2, accountId: "2", courtLabel: "Court 2", start: "19:00", end: "21:00", sessionDate: "2026-06-01" },
    ]);
    store.upsertFromPlannedJobs([
      { sequence: 3, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-08" },
      { sequence: 4, accountId: "1", courtLabel: "Court 2", start: "19:00", end: "21:00", sessionDate: "2026-06-08" },
    ]);
    store.updateRow("2026-06-01", 1, { status: "confirmed" });
    store.updateRow("2026-06-01", 2, { status: "pending_pin" });
    store.updateRow("2026-06-08", 3, { status: "manual_override" });
    store.updateRow("2026-06-08", 4, { status: "failed" });

    const counts = store.countActiveBookingsByAccount({ today: "2026-05-12" });
    assert.equal(counts.get("1"), 2, "1 has confirmed (06-01) + manual_override (06-08); failed not counted");
    assert.equal(counts.get("2"), 1, "2 has pending_pin (06-01)");
  });
});

test("countActiveBookingsByAccount: not_started rows are not counted", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-15" },
    ]);
    const counts = store.countActiveBookingsByAccount({ today: "2026-05-12" });
    assert.equal(counts.get("1") ?? 0, 0, "fresh not_started row should not count");
  });
});

test("countActiveBookingsByAccount: past sessions drop out as today advances", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-05-25" },
    ]);
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-01" },
    ]);
    store.updateRow("2026-05-25", 1, { status: "confirmed" });
    store.updateRow("2026-06-01", 1, { status: "confirmed" });

    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-05-12" }).get("1"),
      2,
      "today=2026-05-12: both sessions still future",
    );
    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-05-25" }).get("1"),
      2,
      "today=2026-05-25: same-day session still active (sessionDate >= today)",
    );
    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-05-26" }).get("1"),
      1,
      "today=2026-05-26: 05-25 has played out; only 06-01 still active",
    );
    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-06-02" }).get("1") ?? 0,
      0,
      "today=2026-06-02: both sessions played out",
    );
  });
});

test("countActiveBookingsByAccount: excludeSessionDate omits a re-planned date so it doesn't double-count", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-01" },
    ]);
    store.upsertFromPlannedJobs([
      { sequence: 1, accountId: "1", courtLabel: "Court 1", start: "19:00", end: "21:00", sessionDate: "2026-06-08" },
    ]);
    store.updateRow("2026-06-01", 1, { status: "confirmed" });
    store.updateRow("2026-06-08", 1, { status: "confirmed" });

    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-05-12" }).get("1"),
      2,
    );
    assert.equal(
      store.countActiveBookingsByAccount({ today: "2026-05-12", excludeSessionDate: "2026-06-08" }).get("1"),
      1,
      "the session being re-planned must not count toward its own cap",
    );
  });
});

test("countActiveBookingsByAccount: rejects malformed dates", () => {
  withTempDir((dir) => {
    const store = new LedgerStore(path.join(dir, "ledger.json"));
    assert.throws(() => store.countActiveBookingsByAccount({ today: "2026-6-1" }), /YYYY-MM-DD/);
    assert.throws(() => store.countActiveBookingsByAccount({ today: "2026-06" }), /YYYY-MM-DD/);
    assert.throws(
      () => store.countActiveBookingsByAccount({ today: "2026-06-01", excludeSessionDate: "bad" }),
      /YYYY-MM-DD/,
    );
  });
});
