import test from "node:test";
import assert from "node:assert/strict";
import {
  extractCourtPinFromText,
  parseGatePinFromCourtRow,
} from "../src/adapters/clubspark/selectors.ts";

test("parseGatePinFromCourtRow extracts digits after 'Court N:'", () => {
  assert.equal(parseGatePinFromCourtRow("Court 3: 0782"), "0782");
  assert.equal(parseGatePinFromCourtRow("Court 1: 1234"), "1234");
  assert.equal(parseGatePinFromCourtRow("  Court 12: 9999  "), "9999");
});

test("parseGatePinFromCourtRow tolerates extra whitespace around colon", () => {
  assert.equal(parseGatePinFromCourtRow("Court 2 :  5555"), "5555");
  assert.equal(parseGatePinFromCourtRow("Court2:6666"), "6666");
});

test("parseGatePinFromCourtRow returns null when no PIN digits present", () => {
  assert.equal(parseGatePinFromCourtRow("Court 1:"), null);
  assert.equal(parseGatePinFromCourtRow("Your pin code"), null);
  assert.equal(parseGatePinFromCourtRow(""), null);
});

test("extractCourtPinFromText picks the PIN for the requested court in a multi-line block", () => {
  const block = "Gate Pin code\nCourt 1: 0782\nCourt 2: 1234\nCourt 3: 9999";
  assert.equal(extractCourtPinFromText(block, 1), "0782");
  assert.equal(extractCourtPinFromText(block, 2), "1234");
  assert.equal(extractCourtPinFromText(block, 3), "9999");
});

test("extractCourtPinFromText handles the real Clubspark card layout (Gate Pin code header + single <li>)", () => {
  const cardText = "Gate Pin code\nCourt 1: 0782";
  assert.equal(extractCourtPinFromText(cardText, 1), "0782");
});

test("extractCourtPinFromText distinguishes Court 1 from Court 10/11 (word boundary)", () => {
  assert.equal(extractCourtPinFromText("Court 10: 5555", 1), null);
  assert.equal(extractCourtPinFromText("Court 10: 5555", 10), "5555");
  assert.equal(extractCourtPinFromText("Court 11: 7777", 1), null);
  const mixed = "Court 1: 1111\nCourt 10: 2222";
  assert.equal(extractCourtPinFromText(mixed, 1), "1111");
  assert.equal(extractCourtPinFromText(mixed, 10), "2222");
});

test("extractCourtPinFromText returns null when the requested court is absent", () => {
  assert.equal(extractCourtPinFromText("Court 1: 0782", 2), null);
  assert.equal(extractCourtPinFromText("", 1), null);
  assert.equal(extractCourtPinFromText("Your pin code", 1), null);
});
