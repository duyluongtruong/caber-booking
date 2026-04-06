import test from "node:test";
import assert from "node:assert/strict";
import { courtNumberFromLabel } from "../src/adapters/clubspark/bookSlot.ts";

test("courtNumberFromLabel parses Court N from label", () => {
  assert.equal(courtNumberFromLabel("Court 3"), 3);
  assert.equal(courtNumberFromLabel("court 12"), 12);
});
