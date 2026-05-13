import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBookingTestId,
  buildPlannedStartTimePattern,
  minutesSinceMidnightToHHmm,
  resolveCourtResource,
  resolveOverlayEndMinutes,
  rowTextMatchesPlannedSlot,
  wallTimeToMinutesSinceMidnight,
  SlotSkippedByOperator,
  SlotUnavailable,
  type CourtResource,
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

test("buildBookingTestId composes the exact Clubspark data-test-id", () => {
  assert.equal(
    buildBookingTestId("f933bbe7-ef18-46bd-a274-debad6e12350", "2026-04-27", 1140),
    "booking-f933bbe7-ef18-46bd-a274-debad6e12350|2026-04-27|1140",
  );
  assert.equal(
    buildBookingTestId("16a3e29f-07b6-4d98-ba53-5c9fcff71808", "2026-04-27", 480),
    "booking-16a3e29f-07b6-4d98-ba53-5c9fcff71808|2026-04-27|480",
  );
});

test("resolveCourtResource returns the matching court by label", () => {
  const resources = new Map<string, CourtResource>([
    ["Court 1", { name: "Court 1", resourceId: "id-1", position: 0 }],
    ["Court 2", { name: "Court 2", resourceId: "id-2", position: 1 }],
  ]);
  assert.equal(resolveCourtResource(resources, "Court 2").resourceId, "id-2");
});

test("resolveCourtResource throws with available court names when label missing", () => {
  const resources = new Map<string, CourtResource>([
    ["Court 1", { name: "Court 1", resourceId: "id-1", position: 0 }],
    ["Court 3", { name: "Court 3", resourceId: "id-3", position: 2 }],
  ]);
  assert.throws(
    () => resolveCourtResource(resources, "Court 2"),
    /no court labelled "Court 2"/i,
  );
  assert.throws(
    () => resolveCourtResource(resources, "Court 2"),
    /Court 1, Court 3/,
  );
});

test("resolveCourtResource reports empty map with clear message", () => {
  assert.throws(
    () => resolveCourtResource(new Map(), "Court 1"),
    /none discovered/,
  );
});

// --- SlotSkippedByOperator ---

test("SlotSkippedByOperator is an Error with correct name", () => {
  const err = new SlotSkippedByOperator("Court 3: operator declined shift from 19:30 to 20:00.");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof SlotSkippedByOperator);
  assert.equal(err.name, "SlotSkippedByOperator");
  assert.match(err.message, /operator declined shift/);
});

test("SlotSkippedByOperator is distinguishable from plain Error via instanceof", () => {
  const skipped = new SlotSkippedByOperator("skipped");
  const plain = new Error("plain");
  assert.ok(skipped instanceof SlotSkippedByOperator);
  assert.ok(!(plain instanceof SlotSkippedByOperator));
});

// --- SlotUnavailable ---

test("SlotUnavailable is an Error with correct name", () => {
  const err = new SlotUnavailable("Court 1 at 19:00 on 2026-06-08 is occupied, and shifting start to 19:30 would leave only 90 min (< 150 min minimum).");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof SlotUnavailable);
  assert.equal(err.name, "SlotUnavailable");
  assert.match(err.message, /is occupied/);
});

test("SlotUnavailable and SlotSkippedByOperator are not interchangeable", () => {
  const unavailable = new SlotUnavailable("unavailable");
  const skipped = new SlotSkippedByOperator("skipped");
  assert.ok(unavailable instanceof SlotUnavailable);
  assert.ok(!(unavailable instanceof SlotSkippedByOperator));
  assert.ok(skipped instanceof SlotSkippedByOperator);
  assert.ok(!(skipped instanceof SlotUnavailable));
});
