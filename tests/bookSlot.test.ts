import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlannedStartTimePattern,
  minutesSinceMidnightToHHmm,
  resolveOverlayEndMinutes,
  rowTextMatchesPlannedSlot,
  wallTimeToMinutesSinceMidnight,
} from "../src/adapters/clubspark/bookSlot.ts";

test("minutesSinceMidnightToHHmm formats Select2 labels", () => {
  assert.equal(minutesSinceMidnightToHHmm(0), "00:00");
  assert.equal(minutesSinceMidnightToHHmm(1200), "20:00");
  assert.equal(minutesSinceMidnightToHHmm(1290), "21:30");
});

test("resolveOverlayEndMinutes: exact, or latest offered ≤ planned", () => {
  assert.equal(resolveOverlayEndMinutes(["1290", "1200", "1170"], 1290), 1290);
  assert.equal(resolveOverlayEndMinutes(["1200"], 1290), 1200);
  assert.equal(resolveOverlayEndMinutes(["1050", "1080", "1110"], 1290), 1110);
  assert.throws(() => resolveOverlayEndMinutes(["1300", "1320"], 1290), /No end time on or before/);
});

test("wallTimeToMinutesSinceMidnight matches Clubspark grid encoding", () => {
  assert.equal(wallTimeToMinutesSinceMidnight("08:00"), 480);
  assert.equal(wallTimeToMinutesSinceMidnight("17:00"), 1020);
  assert.equal(wallTimeToMinutesSinceMidnight("19:30"), 1170);
  assert.equal(wallTimeToMinutesSinceMidnight("21:30"), 1290);
});

test("buildPlannedStartTimePattern matches 24h and 12h evening labels", () => {
  const p = buildPlannedStartTimePattern("19:30");
  assert.match("Court 1 Mon 19:30–21:30", p);
  assert.match("19:30 to 21:30", p);
  assert.match("7:30 pm session", p);
  assert.match("7.30pm", p);
});

test("buildPlannedStartTimePattern: morning 9:30 does not match inside 19:30", () => {
  const morning = buildPlannedStartTimePattern("09:30");
  assert.match("Court 1 09:30", morning);
  assert.doesNotMatch("Court 1 19:30", morning);
  const nineThirty = buildPlannedStartTimePattern("9:30");
  assert.doesNotMatch("Court 1 19:30", nineThirty);
});

test("buildPlannedStartTimePattern matches 21:30 end times", () => {
  const p = buildPlannedStartTimePattern("21:30");
  assert.match("21:30 – 22:00", p);
  assert.match("9:30 pm", p);
});

test("rowTextMatchesPlannedSlot needs both ends — not previous block ending at planned start", () => {
  const job = { start: "19:30", end: "21:30" };
  assert.equal(rowTextMatchesPlannedSlot("Court 1 18:00 - 19:30", job), false);
  assert.equal(rowTextMatchesPlannedSlot("Court 1 18:00 to 19:30 Booked", job), false);
  assert.equal(rowTextMatchesPlannedSlot("Court 1 Mon 19:30–21:30", job), true);
  assert.equal(rowTextMatchesPlannedSlot("7:30 pm – 9:30 pm", job), true);
});

test("rowTextMatchesPlannedSlot for 21:30–22:00 block", () => {
  const job = { start: "21:30", end: "22:00" };
  assert.equal(rowTextMatchesPlannedSlot("19:30 - 21:30", job), false);
  assert.equal(rowTextMatchesPlannedSlot("21:30 - 22:00", job), true);
});
