import test from "node:test";
import assert from "node:assert/strict";
import { buildAdHocSessionTemplate } from "../src/adHocTemplate.ts";
import type { AdHocBookingRequest } from "../src/planner/types.ts";

function baseReq(overrides: Partial<AdHocBookingRequest> = {}): AdHocBookingRequest {
  return {
    sessionDate: "2026-06-01",
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "10:00",
    end: "12:00",
    mode: "dry-run",
    ...overrides,
  };
}

test("ad hoc <= 2h produces one slot", () => {
  const t = buildAdHocSessionTemplate(
    baseReq({ start: "18:00", end: "19:30", mode: "real" }),
  );
  assert.equal(t.sessionDate, "2026-06-01");
  assert.equal(t.maxHoursPerBooking, 2);
  assert.equal(t.slots.length, 1);
  assert.deepEqual(t.slots[0], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "18:00",
    end: "19:30",
  });
});

test("ad hoc exactly 2h produces one slot", () => {
  const t = buildAdHocSessionTemplate(baseReq({ start: "09:00", end: "11:00" }));
  assert.equal(t.slots.length, 1);
  assert.deepEqual(t.slots[0], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "09:00",
    end: "11:00",
  });
});

test("ad hoc > 2h splits into contiguous slots capped by maxHoursPerBooking", () => {
  const t = buildAdHocSessionTemplate(baseReq({ start: "10:00", end: "14:00" }));
  assert.equal(t.slots.length, 2);
  assert.deepEqual(t.slots[0], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "10:00",
    end: "12:00",
  });
  assert.deepEqual(t.slots[1], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "12:00",
    end: "14:00",
  });
});

test("ad hoc > 2h with remainder uses final shorter slot", () => {
  const t = buildAdHocSessionTemplate(baseReq({ start: "10:00", end: "13:30" }));
  assert.equal(t.slots.length, 2);
  assert.deepEqual(t.slots[0], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "10:00",
    end: "12:00",
  });
  assert.deepEqual(t.slots[1], {
    courtIndex: 0,
    courtLabel: "Court 1",
    start: "12:00",
    end: "13:30",
  });
});

test("custom maxHoursPerBooking splits longer sessions", () => {
  const t = buildAdHocSessionTemplate(
    baseReq({ start: "08:00", end: "11:00", maxHoursPerBooking: 1 }),
  );
  assert.equal(t.maxHoursPerBooking, 1);
  assert.equal(t.slots.length, 3);
  assert.deepEqual(
    t.slots.map((s) => `${s.start}-${s.end}`),
    ["08:00-09:00", "09:00-10:00", "10:00-11:00"],
  );
});

test("throws when end is not after start", () => {
  assert.throws(() => buildAdHocSessionTemplate(baseReq({ start: "12:00", end: "12:00" })), /after start/);
  assert.throws(() => buildAdHocSessionTemplate(baseReq({ start: "14:00", end: "13:00" })), /after start/);
});

test("request may include accountIdOverride without affecting template slots", () => {
  const t = buildAdHocSessionTemplate(
    baseReq({ start: "10:00", end: "11:00", accountIdOverride: "acc-1" }),
  );
  assert.equal(t.slots.length, 1);
});
