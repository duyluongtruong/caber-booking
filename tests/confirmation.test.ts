import test from "node:test";
import assert from "node:assert/strict";
import {
  bookingUrl,
  buildVenueContext,
  DEFAULT_VENUE_SLUG,
  extractCourtPinFromText,
  extractVenueSlugFromBookingBaseUrl,
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

test("buildVenueContext composes the three URL pieces from a slug", () => {
  const ctx = buildVenueContext("FairfieldTennisCourts");
  assert.equal(ctx.slug, "FairfieldTennisCourts");
  assert.equal(
    ctx.bookingBase,
    "https://play.tennis.com.au/FairfieldTennisCourts/Booking/BookByDate",
  );
  assert.equal(
    ctx.manageBookings,
    "https://play.tennis.com.au/FairfieldTennisCourts/Booking/Bookings",
  );
  assert.match(
    "/FairfieldTennisCourts/Booking/BookingConfirmation/11d906d2-adb2-44ce-ab6f-23f5eac96d5f",
    ctx.confirmationUrlRegex,
  );
});

test("buildVenueContext: confirmation regex does not match a different venue slug", () => {
  const ctx = buildVenueContext("FairfieldTennisCourts");
  assert.doesNotMatch(
    "/CaberParkTennisCourts/Booking/BookingConfirmation/11d906d2-adb2-44ce-ab6f-23f5eac96d5f",
    ctx.confirmationUrlRegex,
  );
});

test("buildVenueContext rejects empty or unsafe slugs", () => {
  assert.throws(() => buildVenueContext(""), /non-empty string/);
  assert.throws(() => buildVenueContext("with spaces"), /URL-safe/);
  assert.throws(() => buildVenueContext("with/slash"), /URL-safe/);
});

test("bookingUrl(ctx, opts) builds hash-style date+role URLs against the venue base", () => {
  const ctx = buildVenueContext("CaberParkTennisCourts");
  assert.equal(
    bookingUrl(ctx, { date: "2026-04-27", role: "guest" }),
    "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?date=2026-04-27&role=guest",
  );
  assert.equal(
    bookingUrl(ctx, { date: "2026-04-27" }),
    "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate#?date=2026-04-27",
  );
  assert.equal(
    bookingUrl(ctx),
    "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate",
  );
});

test("bookingUrl falls back to default slug when called without ctx (legacy callers)", () => {
  assert.equal(
    bookingUrl({ date: "2026-04-27" }),
    `https://play.tennis.com.au/${DEFAULT_VENUE_SLUG}/Booking/BookByDate#?date=2026-04-27`,
  );
});

test("extractVenueSlugFromBookingBaseUrl parses play.tennis.com.au booking URLs", () => {
  assert.equal(
    extractVenueSlugFromBookingBaseUrl(
      "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookByDate",
    ),
    "CaberParkTennisCourts",
  );
  assert.equal(
    extractVenueSlugFromBookingBaseUrl(
      "https://play.tennis.com.au/FairfieldTennisCourts/Booking/BookByDate#?date=2026-04-27",
    ),
    "FairfieldTennisCourts",
  );
  assert.equal(extractVenueSlugFromBookingBaseUrl("https://example.test/foo/bar"), null);
  assert.equal(extractVenueSlugFromBookingBaseUrl("not a url"), null);
});
