import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  distinctCourts,
  filterByCourt,
  groupByCourt,
  rowsForDate,
  sortRowsForDisplay,
} from "../src/viewer/selectors.ts";
import type { LedgerFile } from "../src/ledger/types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(HERE, "fixtures/ledger.viewer.sample.json"), "utf8"),
) as LedgerFile;

test("rowsForDate: returns rows for a present date", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.equal(rows.length, 3);
});

test("rowsForDate: returns [] for an absent date", () => {
  assert.deepEqual(rowsForDate(FIXTURE, "1900-01-01"), []);
});

test("rowsForDate: returns [] when sessions key is empty array", () => {
  assert.deepEqual(rowsForDate(FIXTURE, "2099-03-01"), []);
});

test("rowsForDate: returns [] when file is null", () => {
  assert.deepEqual(rowsForDate(null, "2099-01-01"), []);
});

test("distinctCourts: returns sorted unique court labels", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  assert.deepEqual(distinctCourts(rows), ["Court 1", "Court 3"]);
});

test("distinctCourts: returns [] for empty rows", () => {
  assert.deepEqual(distinctCourts([]), []);
});

test("filterByCourt: null returns input unchanged", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.equal(filterByCourt(rows, null).length, 3);
});

test("filterByCourt: filters to matching court", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  const filtered = filterByCourt(rows, "Court 2");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].courtLabel, "Court 2");
});

test("filterByCourt: empty when no match", () => {
  const rows = rowsForDate(FIXTURE, "2099-01-01");
  assert.deepEqual(filterByCourt(rows, "Court 99"), []);
});

test("sortRowsForDisplay: sorts by court asc, then start asc", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  const sorted = sortRowsForDisplay(rows);
  assert.deepEqual(
    sorted.map((r) => `${r.courtLabel} ${r.start}`),
    ["Court 1 08:00", "Court 3 10:00", "Court 3 11:00", "Court 3 12:00"],
  );
});

test("sortRowsForDisplay: does not mutate input", () => {
  const rows = rowsForDate(FIXTURE, "2099-02-01");
  const original = rows.map((r) => `${r.courtLabel} ${r.start}`);
  sortRowsForDisplay(rows);
  assert.deepEqual(rows.map((r) => `${r.courtLabel} ${r.start}`), original);
});

test("groupByCourt: groups in court-asc order with rows in start-asc order", () => {
  const rows = sortRowsForDisplay(rowsForDate(FIXTURE, "2099-02-01"));
  const groups = groupByCourt(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].courtLabel, "Court 1");
  assert.equal(groups[0].rows.length, 1);
  assert.equal(groups[1].courtLabel, "Court 3");
  assert.deepEqual(
    groups[1].rows.map((r) => r.start),
    ["10:00", "11:00", "12:00"],
  );
});

test("groupByCourt: empty input → empty output", () => {
  assert.deepEqual(groupByCourt([]), []);
});
