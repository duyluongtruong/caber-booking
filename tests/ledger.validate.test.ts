import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLedgerFile } from "../src/ledger/validate.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(HERE, "fixtures/ledger.viewer.sample.json"), "utf8"),
);

test("isLedgerFile: accepts the sample fixture", () => {
  assert.equal(isLedgerFile(FIXTURE), true);
});

test("isLedgerFile: accepts an empty sessions object", () => {
  assert.equal(isLedgerFile({ sessions: {} }), true);
});

test("isLedgerFile: rejects non-object root", () => {
  assert.equal(isLedgerFile(null), false);
  assert.equal(isLedgerFile([]), false);
  assert.equal(isLedgerFile("nope"), false);
});

test("isLedgerFile: rejects missing 'sessions' key", () => {
  assert.equal(isLedgerFile({}), false);
});

test("isLedgerFile: rejects 'sessions' that is not a record", () => {
  assert.equal(isLedgerFile({ sessions: [] }), false);
  assert.equal(isLedgerFile({ sessions: null }), false);
});

test("isLedgerFile: rejects a row missing required fields", () => {
  assert.equal(
    isLedgerFile({ sessions: { "2099-01-01": [{ courtLabel: "Court 1" }] } }),
    false,
  );
});

test("isLedgerFile: rejects a row with an unknown status", () => {
  assert.equal(
    isLedgerFile({
      sessions: {
        "2099-01-01": [
          {
            sessionDate: "2099-01-01",
            courtLabel: "Court 1",
            start: "19:30",
            end: "20:00",
            accountId: "a",
            jobSequence: 1,
            status: "bogus",
          },
        ],
      },
    }),
    false,
  );
});
