import test from "node:test";
import assert from "node:assert/strict";
import { planJobs, defaultThreeCourtMondaySlots } from "../src/planner/planJobs.ts";
import type { BookingAccount, SessionTemplate } from "../src/planner/types.ts";

const courts = ["Court 1", "Court 2", "Court 3"] as [string, string, string];

test("one-court template with a single slot plans successfully", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A" }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [{ courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" }],
    maxHoursPerBooking: 2,
  };
  const jobs = planJobs(accounts, template);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].accountId, "a");
  assert.equal(jobs[0].courtLabel, "Court 1");
});

test("one-court template with two non-overlapping slots can use one account", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A" }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [
      { courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" },
      { courtIndex: 0, courtLabel: "Court 1", start: "09:30", end: "11:30" },
    ],
    maxHoursPerBooking: 2,
  };
  const jobs = planJobs(accounts, template);
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((j) => j.accountId === "a"));
});

test("two-court simultaneous slots require two accounts (overlap)", () => {
  const accounts: BookingAccount[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [
      { courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" },
      { courtIndex: 1, courtLabel: "Court 2", start: "07:30", end: "09:30" },
    ],
    maxHoursPerBooking: 2,
  };
  const jobs = planJobs(accounts, template);
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].accountId, jobs[1].accountId);
});

test("accountId override assigns all slots to that account when within limits", () => {
  const accounts: BookingAccount[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [{ courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" }],
    maxHoursPerBooking: 2,
  };
  const jobs = planJobs(accounts, template, { accountId: "b" });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].accountId, "b");
});

test("accountId override rejects empty-string account id", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A" }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [{ courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" }],
    maxHoursPerBooking: 2,
  };
  assert.throws(
    () => planJobs(accounts, template, { accountId: "" }),
    /accountId override must not be empty/,
  );
});

test("accountId override fails when account id is unknown", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A" }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [{ courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" }],
    maxHoursPerBooking: 2,
  };
  assert.throws(() => planJobs(accounts, template, { accountId: "missing" }), /Unknown booking account id/);
});

test("accountId override fails when account is inactive", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A", active: false }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [{ courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "09:30" }],
    maxHoursPerBooking: 2,
  };
  assert.throws(() => planJobs(accounts, template, { accountId: "a" }), /not active/);
});

test("accountId override fails clearly when slots cannot fit that account", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A", maxBookingsPerDay: 2 }];
  const base = defaultThreeCourtMondaySlots(courts);
  const template: SessionTemplate = { ...base, sessionDate: "2026-05-25" };
  assert.throws(
    () => planJobs(accounts, template, { accountId: "a" }),
    /Cannot assign all slots to account/,
  );
});

test("throws when not enough account capacity for 6 slots (max 2 per account)", () => {
  const accounts: BookingAccount[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  const base = defaultThreeCourtMondaySlots(courts);
  const template: SessionTemplate = { ...base, sessionDate: "2026-05-25" };
  assert.throws(() => planJobs(accounts, template), /Not enough account capacity/);
});

test("each account has at most 2 jobs and no overlapping times on same account", () => {
  const accounts: BookingAccount[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ];
  const base = defaultThreeCourtMondaySlots(courts);
  const template: SessionTemplate = { ...base, sessionDate: "2026-05-25" };
  const jobs = planJobs(accounts, template);
  assert.equal(jobs.length, 6);

  const byAccount = new Map<string, typeof jobs>();
  for (const j of jobs) {
    const list = byAccount.get(j.accountId) ?? [];
    list.push(j);
    byAccount.set(j.accountId, list);
  }
  for (const [, list] of byAccount) {
    assert.ok(list.length <= 2, `account has ${list.length} jobs`);
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        const A = list[i];
        const B = list[k];
        const as = toMin(A.start);
        const ae = toMin(A.end);
        const bs = toMin(B.start);
        const be = toMin(B.end);
        const overlap = as < be && bs < ae;
        assert.equal(overlap, false, `overlap ${A.start}-${A.end} vs ${B.start}-${B.end}`);
      }
    }
  }
});

test("throws when a single slot exceeds maxHoursPerBooking", () => {
  const accounts: BookingAccount[] = [{ id: "a", label: "A" }];
  const template: SessionTemplate = {
    sessionDate: "2026-05-25",
    slots: [
      { courtIndex: 0, courtLabel: "Court 1", start: "07:30", end: "10:30" },
      { courtIndex: 1, courtLabel: "Court 2", start: "07:30", end: "09:30" },
      { courtIndex: 2, courtLabel: "Court 3", start: "07:30", end: "09:30" },
    ],
    maxHoursPerBooking: 2,
  };
  assert.throws(() => planJobs(accounts, template), /max 2h/);
});

test("deterministic assignment: stable order for same inputs", () => {
  const accounts: BookingAccount[] = [
    { id: "c", label: "C" },
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ];
  const template: SessionTemplate = {
    ...defaultThreeCourtMondaySlots(courts),
    sessionDate: "2026-05-25",
  };
  const j1 = planJobs(accounts, template);
  const j2 = planJobs(
    [
      { id: "b", label: "B" },
      { id: "a", label: "A" },
      { id: "c", label: "C" },
    ],
    template,
  );
  assert.deepEqual(
    j1.map((j) => j.accountId),
    j2.map((j) => j.accountId),
  );
});

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
