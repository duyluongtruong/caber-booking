import test from "node:test";
import assert from "node:assert/strict";
import {
  assertIsoDate,
  formatLocalIsoDate,
  mondayWeeksAhead,
  resolveSessionDate,
  upcomingMonday,
} from "../src/sessionDate.ts";

test("upcomingMonday: Monday stays same day", () => {
  const mon = upcomingMonday(new Date(2026, 3, 6));
  assert.equal(formatLocalIsoDate(mon), "2026-04-06");
});

test("upcomingMonday: Wednesday -> next Monday", () => {
  const mon = upcomingMonday(new Date(2026, 3, 8));
  assert.equal(formatLocalIsoDate(mon), "2026-04-13");
});

test("mondayWeeksAhead: 0 from Monday is that Monday", () => {
  const d = mondayWeeksAhead(0, new Date(2026, 3, 6));
  assert.equal(formatLocalIsoDate(d), "2026-04-06");
});

test("mondayWeeksAhead: 1 week after a Monday", () => {
  const d = mondayWeeksAhead(1, new Date(2026, 3, 6));
  assert.equal(formatLocalIsoDate(d), "2026-04-13");
});

test("resolveSessionDate: explicit date", () => {
  assert.equal(resolveSessionDate({ date: "2026-05-25" }), "2026-05-25");
});

test("resolveSessionDate: weeks only", () => {
  const d = resolveSessionDate({ weeks: 0, date: undefined });
  assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
});

test("assertIsoDate rejects bad input", () => {
  assert.throws(() => assertIsoDate("2026-13-40"), /Invalid/);
});
