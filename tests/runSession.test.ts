import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { planMondayPresetJobs, runPlannedJobsWithLedger } from "../src/runner/runSession.ts";
import { LedgerStore, type LedgerRowPatch } from "../src/ledger/store.ts";
import { planJobs } from "../src/planner/planJobs.ts";
import { buildMondayThreeCourtTemplate } from "../src/mondayPlan.ts";
import type { LoadedConfig, ConfigAccount } from "../src/loadConfig.ts";
import { buildVenueContext, DEFAULT_VENUE_SLUG } from "../src/adapters/clubspark/selectors.ts";
import type { PlannedJob } from "../src/planner/types.ts";

const TEST_VENUE = buildVenueContext(DEFAULT_VENUE_SLUG);

function withTempLedgerPath(fn: (ledgerPath: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tennis-run-"));
  return (async () => {
    try {
      await fn(path.join(dir, "ledger.json"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  })();
}

test("runPlannedJobsWithLedger with skipUpsert does not upsert again (caller-owned ledger rows)", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    class CountingLedgerStore extends LedgerStore {
      upsertCount = 0;
      override upsertFromPlannedJobs(jobs: PlannedJob[]): void {
        this.upsertCount++;
        super.upsertFromPlannedJobs(jobs);
      }
    }
    const store = new CountingLedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    store.upsertFromPlannedJobs(jobs);
    assert.equal(store.upsertCount, 1);

    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount: (): ConfigAccount => ({
        id: "a",
        label: "A",
        username: "u",
        password: "p",
      }),
      executeJob: async () => null,
      skipUpsert: true,
    });

    assert.equal(
      store.upsertCount,
      1,
      "runner must not call upsertFromPlannedJobs when skipUpsert is true",
    );
  });
});

test("planMondayPresetJobs matches planJobs(buildMondayThreeCourtTemplate)", () => {
  const accounts: ConfigAccount[] = [
    { id: "a", label: "A", username: "u1", password: "p1" },
    { id: "b", label: "B", username: "u2", password: "p2" },
    { id: "c", label: "C", username: "u3", password: "p3" },
  ];
  const cfg: LoadedConfig = { venue: TEST_VENUE, accounts };
  const sessionDate = "2026-05-25";
  const expected = planJobs(accounts, buildMondayThreeCourtTemplate(sessionDate));
  const actual = planMondayPresetJobs(cfg, sessionDate);
  assert.deepEqual(actual, expected);
});

test("runPlannedJobsWithLedger upserts rows and sets confirmed when executor returns PIN", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    const getAccount = (id: string): ConfigAccount => {
      assert.equal(id, "a");
      return { id: "a", label: "A", username: "u", password: "p" };
    };
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount,
      executeJob: async () => "9999",
    });
    const rows = store.getRows(sessionDate);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "confirmed");
    assert.equal(rows[0].accessCode, "9999");
  });
});

test("runPlannedJobsWithLedger sets pending_pin when executor returns null", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    const getAccount = (): ConfigAccount => ({
      id: "a",
      label: "A",
      username: "u",
      password: "p",
    });
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount,
      executeJob: async () => null,
    });
    const rows = store.getRows(sessionDate);
    assert.equal(rows[0].status, "pending_pin");
    assert.equal(rows[0].accessCode, undefined);
  });
});

test("runPlannedJobsWithLedger rethrows ledger error when success-path update throws after executeJob succeeds", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    class SuccessPathFailsStore extends LedgerStore {
      override updateRowForPlannedJob(job: PlannedJob, patch: LedgerRowPatch): void {
        if (patch.status === "confirmed" || patch.status === "pending_pin") {
          throw new Error("ledger success-path write failed");
        }
        super.updateRowForPlannedJob(job, patch);
      }
    }
    const store = new SuccessPathFailsStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    await assert.rejects(
      async () =>
        runPlannedJobsWithLedger({
          jobs,
          store,
          getAccount: (): ConfigAccount => ({
            id: "a",
            label: "A",
            username: "u",
            password: "p",
          }),
          executeJob: async () => "9999",
        }),
      { message: "ledger success-path write failed" },
    );
    const rows = store.getRows(sessionDate);
    assert.notEqual(rows[0].status, "failed", "checkout succeeded; ledger write failure must not mark row failed");
    assert.equal(rows[0].status, "not_started");
  });
});

test("runPlannedJobsWithLedger rethrows original error when failed-status ledger update throws", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    class FailingFailedStatusStore extends LedgerStore {
      override updateRowForPlannedJob(job: PlannedJob, patch: LedgerRowPatch): void {
        if (patch.status === "failed") {
          throw new Error("ledger simulated failure recording status");
        }
        super.updateRowForPlannedJob(job, patch);
      }
    }
    const store = new FailingFailedStatusStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    await assert.rejects(
      async () =>
        runPlannedJobsWithLedger({
          jobs,
          store,
          getAccount: (): ConfigAccount => ({
            id: "a",
            label: "A",
            username: "u",
            password: "p",
          }),
          executeJob: async () => {
            throw new Error("original checkout error");
          },
        }),
      { message: "original checkout error" },
    );
  });
});

test("runPlannedJobsWithLedger marks failed and unattempted rows as not_started", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 2,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 3,
        accountId: "c",
        courtLabel: "Court 3",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    const getAccount = (id: string): ConfigAccount => ({
      id,
      label: id.toUpperCase(),
      username: `u-${id}`,
      password: "p",
    });

    await assert.rejects(
      async () =>
        runPlannedJobsWithLedger({
          jobs,
          store,
          getAccount,
          executeJob: async (job) => {
            if (job.sequence === 1) return "1111";
            throw new Error("simulated checkout failure");
          },
        }),
      /simulated checkout failure/,
    );

    const rows = store.getRows(sessionDate);
    assert.equal(rows[0].status, "confirmed");
    assert.equal(rows[0].accessCode, "1111");
    assert.equal(rows[1].status, "failed");
    assert.equal(rows[2].status, "not_started", "unattempted job must be not_started, not pending_pin");
  });
});

test("runPlannedJobsWithLedger marks row failed when getAccount throws", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 2,
        accountId: "missing",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 3,
        accountId: "c",
        courtLabel: "Court 3",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    const getAccount = (id: string): ConfigAccount => {
      if (id === "missing") throw new Error(`No account "${id}"`);
      return { id, label: id.toUpperCase(), username: `u-${id}`, password: "p" };
    };

    await assert.rejects(
      async () =>
        runPlannedJobsWithLedger({
          jobs,
          store,
          getAccount,
          executeJob: async () => "PIN",
        }),
      /No account "missing"/,
    );

    const rows = store.getRows(sessionDate);
    assert.equal(rows[0].status, "confirmed");
    assert.equal(rows[1].status, "failed", "account lookup failure must mark row as failed");
    assert.equal(rows[2].status, "not_started", "unattempted job after abort must be not_started");
  });
});

test("runPlannedJobsWithLedger updates row by court/time when jobSequence collides across upserts", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-06-10";
    // Two separate upserts (e.g. book-one batches) can reuse sequence=1; ledger keys rows by court+time.
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    const before = store.getRows(sessionDate);
    assert.equal(before.length, 2);
    assert.ok(before.every((r) => r.jobSequence === 1), "both rows can share jobSequence after separate upserts");

    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount: (id): ConfigAccount => ({
        id,
        label: id.toUpperCase(),
        username: `u-${id}`,
        password: "p",
      }),
      executeJob: async () => "2222",
      skipUpsert: true,
    });

    const court1 = store.getRows(sessionDate).find((r) => r.courtLabel === "Court 1");
    const court2 = store.getRows(sessionDate).find((r) => r.courtLabel === "Court 2");
    assert.ok(court1 && court2);
    assert.equal(court1.status, "not_started", "Court 1 row must not be updated when only Court 2 job ran");
    assert.equal(court1.accessCode, undefined);
    assert.equal(court2.status, "confirmed");
    assert.equal(court2.accessCode, "2222");
  });
});

test("runPlannedJobsWithLedger failure marks failed row by court/time when jobSequence collides", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-06-11";
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);
    store.upsertFromPlannedJobs([
      {
        sequence: 1,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ]);

    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 1,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];

    await assert.rejects(
      async () =>
        runPlannedJobsWithLedger({
          jobs,
          store,
          getAccount: (id): ConfigAccount => ({
            id,
            label: id.toUpperCase(),
            username: `u-${id}`,
            password: "p",
          }),
          executeJob: async (job) => {
            if (job.courtLabel === "Court 1") return "1111";
            throw new Error("Court 2 checkout failed");
          },
          skipUpsert: true,
        }),
      /Court 2 checkout failed/,
    );

    const court1 = store.getRows(sessionDate).find((r) => r.courtLabel === "Court 1");
    const court2 = store.getRows(sessionDate).find((r) => r.courtLabel === "Court 2");
    assert.ok(court1 && court2);
    assert.equal(court1.status, "confirmed", "Court 1 must stay confirmed; failure was on Court 2");
    assert.equal(court1.accessCode, "1111");
    assert.equal(court2.status, "failed");
  });
});

test("runPlannedJobsWithLedger log does not contain PIN values even with end-of-run summary", async () => {
  await withTempLedgerPath(async (ledgerPath) => {
    const store = new LedgerStore(ledgerPath);
    const sessionDate = "2026-05-25";
    const jobs: PlannedJob[] = [
      {
        sequence: 1,
        accountId: "a",
        courtLabel: "Court 1",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
      {
        sequence: 2,
        accountId: "b",
        courtLabel: "Court 2",
        start: "19:30",
        end: "21:30",
        sessionDate,
      },
    ];
    const getAccount = (id: string): ConfigAccount => ({
      id,
      label: id.toUpperCase(),
      username: `u-${id}`,
      password: "p",
    });
    const logged: string[] = [];
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount,
      executeJob: async (job) => (job.sequence === 1 ? "5678" : null),
      log: (line) => logged.push(line),
      sessionDate,
    });
    const all = logged.join("\n");
    assert.equal(all.includes("5678"), false, "PIN value must not appear in log output");
    assert.match(all, /done/, "should still log per-job completion");
    assert.match(all, /all jobs finished/, "should log end-of-run");
    assert.match(all, /confirmed/, "summary should include status counts");
    assert.match(all, /pending_pin/, "summary should include status counts");
  });
});
