import test from "node:test";
import assert from "node:assert/strict";
import { minutesToHHmm, timeToMinutes } from "../src/planner/time.ts";

test("timeToMinutes parses valid HH:mm values", () => {
  assert.equal(timeToMinutes("00:00"), 0);
  assert.equal(timeToMinutes("9:30"), 570);
  assert.equal(timeToMinutes("21:45"), 1305);
});

test("time helpers reject invalid input and format zero-padded output", () => {
  assert.throws(() => timeToMinutes("24:00"), /Invalid time/);
  assert.throws(() => timeToMinutes("9:99"), /Invalid time/);
  assert.throws(() => timeToMinutes("bad"), /expected HH:mm/);
  assert.throws(() => minutesToHHmm(-1), /Invalid minutes since midnight/);
  assert.throws(() => minutesToHHmm(1440), /Invalid minutes since midnight/);
  assert.throws(() => minutesToHHmm(1500), /Invalid minutes since midnight/);
  assert.equal(minutesToHHmm(0), "00:00");
  assert.equal(minutesToHHmm(570), "09:30");
  assert.equal(minutesToHHmm(1305), "21:45");
});
