import test from "node:test";
import assert from "node:assert/strict";
import {
  bookOneRequestedSpanExceedsTwoHours,
  resolveCourtForBookOne,
  planBookOneJobs,
} from "../src/bookOnePlan.ts";
import type { LoadedConfig } from "../src/loadConfig.ts";

const labels = ["Court 1", "Court 2", "Court 3"] as const;

test("resolveCourtForBookOne accepts bare court numbers", () => {
  assert.deepEqual(resolveCourtForBookOne("1", labels), { courtIndex: 0, courtLabel: "Court 1" });
  assert.deepEqual(resolveCourtForBookOne("2", labels), { courtIndex: 1, courtLabel: "Court 2" });
  assert.deepEqual(resolveCourtForBookOne("03", labels), { courtIndex: 2, courtLabel: "Court 3" });
});

test("resolveCourtForBookOne accepts labels case-insensitively", () => {
  assert.deepEqual(resolveCourtForBookOne("court 2", labels), { courtIndex: 1, courtLabel: "Court 2" });
  assert.deepEqual(resolveCourtForBookOne("COURT 1", labels), { courtIndex: 0, courtLabel: "Court 1" });
});

test("resolveCourtForBookOne defaults to court 1 when omitted", () => {
  assert.deepEqual(resolveCourtForBookOne(undefined, labels), { courtIndex: 0, courtLabel: "Court 1" });
  assert.deepEqual(resolveCourtForBookOne("  ", labels), { courtIndex: 0, courtLabel: "Court 1" });
});

test("resolveCourtForBookOne rejects out-of-range numbers and unknown labels", () => {
  assert.throws(() => resolveCourtForBookOne("0", labels), /1–3/);
  assert.throws(() => resolveCourtForBookOne("4", labels), /1–3/);
  assert.throws(() => resolveCourtForBookOne("Court 9", labels), /Unknown court/);
});

test("planBookOneJobs splits >2h and assigns single account when --account override", () => {
  const cfg: LoadedConfig = {
    accounts: [
      { id: "a", label: "A", username: "u1", password: "p1", maxBookingsPerDay: 2 },
      { id: "b", label: "B", username: "u2", password: "p2" },
    ],
  };
  const jobs = planBookOneJobs(cfg, {
    sessionDate: "2026-07-01",
    courtArg: "1",
    start: "10:00",
    end: "14:00",
    accountId: "a",
  });
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.accountId === "a"));
  assert.equal(jobs[0].start, "10:00");
  assert.equal(jobs[0].end, "12:00");
  assert.equal(jobs[1].start, "12:00");
  assert.equal(jobs[1].end, "14:00");
});

test("planBookOneJobs uses config default session times when start/end omitted", () => {
  const cfg: LoadedConfig = {
    defaultSessionStart: "18:00",
    defaultSessionEnd: "19:30",
    accounts: [{ id: "x", label: "X", username: "u", password: "p" }],
  };
  const jobs = planBookOneJobs(cfg, {
    sessionDate: "2026-07-02",
    courtArg: "2",
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].courtLabel, "Court 2");
  assert.equal(jobs[0].start, "18:00");
  assert.equal(jobs[0].end, "19:30");
});

test("bookOneRequestedSpanExceedsTwoHours is true only when span is strictly over 2h", () => {
  assert.equal(bookOneRequestedSpanExceedsTwoHours("10:00", "12:00"), false);
  assert.equal(bookOneRequestedSpanExceedsTwoHours("10:00", "12:01"), true);
});

test("planBookOneJobs throws when no start/end and no config defaults", () => {
  const cfg: LoadedConfig = {
    accounts: [{ id: "x", label: "X", username: "u", password: "p" }],
  };
  assert.throws(
    () =>
      planBookOneJobs(cfg, {
        sessionDate: "2026-07-03",
      }),
    /--start.*--end|defaultSessionStart/,
  );
});

test("planBookOneJobs rejects unknown --account override id", () => {
  const cfg: LoadedConfig = {
    accounts: [{ id: "a", label: "A", username: "u", password: "p" }],
  };
  assert.throws(
    () =>
      planBookOneJobs(cfg, {
        sessionDate: "2026-07-04",
        courtArg: "1",
        start: "10:00",
        end: "11:00",
        accountId: "nope",
      }),
    /Unknown booking account id/,
  );
});

test("planBookOneJobs rejects --account override when split jobs exceed that account's per-day cap", () => {
  const cfg: LoadedConfig = {
    accounts: [{ id: "a", label: "A", username: "u", password: "p", maxBookingsPerDay: 1 }],
  };
  assert.throws(
    () =>
      planBookOneJobs(cfg, {
        sessionDate: "2026-07-05",
        courtArg: "1",
        start: "10:00",
        end: "14:00",
        accountId: "a",
      }),
    /Cannot assign all slots to account/,
  );
});
