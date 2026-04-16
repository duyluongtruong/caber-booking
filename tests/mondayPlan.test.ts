import test from "node:test";
import assert from "node:assert/strict";
import { buildMondayThreeCourtTemplate, DEFAULT_COURT_LABELS } from "../src/mondayPlan.ts";
import { defaultThreeCourtMondaySlots, planJobs } from "../src/planner/planJobs.ts";
import type { BookingAccount } from "../src/planner/types.ts";

test("Monday template matches default three-court slot pattern", () => {
  const sessionDate = "2026-05-25";
  assert.deepEqual(buildMondayThreeCourtTemplate(sessionDate), {
    sessionDate,
    ...defaultThreeCourtMondaySlots([...DEFAULT_COURT_LABELS]),
  });
});

test("Monday 3-court template yields 6 jobs with 3 accounts", () => {
  const accounts: BookingAccount[] = [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
  ];
  const jobs = planJobs(accounts, buildMondayThreeCourtTemplate("2026-05-25"));
  assert.equal(jobs.length, 6);
  const courts = new Set(jobs.map((j) => j.courtLabel));
  assert.equal(courts.size, 3);
});
