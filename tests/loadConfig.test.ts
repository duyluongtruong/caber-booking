import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { loadConfig, resolveVenueForRun, type LoadedConfig } from "../src/loadConfig.ts";
import { buildVenueContext, DEFAULT_VENUE_SLUG } from "../src/adapters/clubspark/selectors.ts";

const fixturePath = path.join(import.meta.dirname, "fixtures", "accounts.sample.json");

function withTempConfig<T>(content: object, fn: (filePath: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tennis-cfg-"));
  const filePath = path.join(dir, "config.json");
  writeFileSync(filePath, JSON.stringify(content), "utf8");
  try {
    return fn(filePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadConfig: excludes inactive account; usernames and non-empty passwords", () => {
  const cfg = loadConfig(fixturePath);

  assert.equal(cfg.accounts.length, 2);
  const ids = cfg.accounts.map((a) => a.id).sort();
  assert.deepEqual(ids, ["acc-alpha", "acc-gamma"]);

  const usernames = new Set(cfg.accounts.map((a) => a.username));
  assert.ok(usernames.has("alpha_fixture_user"));
  assert.ok(usernames.has("gamma_fixture_user"));
  assert.equal(usernames.has("beta_fixture_user"), false);

  for (const a of cfg.accounts) {
    assert.ok(a.password.length > 0, "password must be non-empty");
  }

  assert.equal(cfg.venueBaseUrl, "https://example.test/venue/booking");
  assert.equal(cfg.defaultSessionStart, "08:00");
  assert.equal(cfg.defaultSessionEnd, "12:00");
});

test("loadConfig: throws when no active accounts", () => {
  const p = path.join(import.meta.dirname, "fixtures", "accounts.all-inactive.json");
  assert.throws(() => loadConfig(p), /No active accounts/);
});

test("loadConfig: explicit venueSlug builds venue context with that slug", () => {
  withTempConfig(
    {
      venueSlug: "FairfieldTennisCourts",
      accounts: [
        { id: "1", label: "A", username: "u", password: "p", active: true },
      ],
    },
    (p) => {
      const cfg = loadConfig(p);
      assert.equal(cfg.venueSlug, "FairfieldTennisCourts");
      assert.equal(cfg.venue.slug, "FairfieldTennisCourts");
      assert.equal(
        cfg.venue.bookingBase,
        "https://play.tennis.com.au/FairfieldTennisCourts/Booking/BookByDate",
      );
      assert.equal(
        cfg.venue.manageBookings,
        "https://play.tennis.com.au/FairfieldTennisCourts/Booking/Bookings",
      );
      assert.match(
        "/FairfieldTennisCourts/Booking/BookingConfirmation/abc-123",
        cfg.venue.confirmationUrlRegex,
      );
      assert.doesNotMatch(
        "/CaberParkTennisCourts/Booking/BookingConfirmation/abc-123",
        cfg.venue.confirmationUrlRegex,
      );
    },
  );
});

test("loadConfig: derives venueSlug from play.tennis.com.au venueBaseUrl when slug not set", () => {
  withTempConfig(
    {
      venueBaseUrl: "https://play.tennis.com.au/SomeCourts/Booking/BookByDate",
      accounts: [
        { id: "1", label: "A", username: "u", password: "p", active: true },
      ],
    },
    (p) => {
      const cfg = loadConfig(p);
      assert.equal(cfg.venue.slug, "SomeCourts");
      assert.equal(
        cfg.venue.bookingBase,
        "https://play.tennis.com.au/SomeCourts/Booking/BookByDate",
      );
    },
  );
});

test("loadConfig: falls back to default slug when neither venueSlug nor parseable venueBaseUrl is set", () => {
  withTempConfig(
    {
      accounts: [
        { id: "1", label: "A", username: "u", password: "p", active: true },
      ],
    },
    (p) => {
      const cfg = loadConfig(p);
      assert.equal(cfg.venue.slug, DEFAULT_VENUE_SLUG);
      assert.equal(
        cfg.venue.bookingBase,
        `https://play.tennis.com.au/${DEFAULT_VENUE_SLUG}/Booking/BookByDate`,
      );
    },
  );
});

test("loadConfig: rejects venueSlug with URL-unsafe characters", () => {
  withTempConfig(
    {
      venueSlug: "bad slug/with spaces",
      accounts: [
        { id: "1", label: "A", username: "u", password: "p", active: true },
      ],
    },
    (p) => {
      assert.throws(() => loadConfig(p), /invalid venueSlug/);
    },
  );
});

test("resolveVenueForRun: returns cfg.venue when no CLI override is set", () => {
  const cfg: LoadedConfig = {
    venue: buildVenueContext("CaberParkTennisCourts"),
    accounts: [{ id: "1", label: "A", username: "u", password: "p" }],
  };
  const venue = resolveVenueForRun(cfg);
  assert.equal(venue.slug, "CaberParkTennisCourts");
  assert.equal(venue, cfg.venue, "should be the same object reference, no rebuild");
});

test("resolveVenueForRun: CLI slug wins over cfg.venueSlug", () => {
  const cfg: LoadedConfig = {
    venue: buildVenueContext("CaberParkTennisCourts"),
    accounts: [{ id: "1", label: "A", username: "u", password: "p" }],
  };
  const venue = resolveVenueForRun(cfg, "FairfieldTennisCourts");
  assert.equal(venue.slug, "FairfieldTennisCourts");
  assert.equal(
    venue.bookingBase,
    "https://play.tennis.com.au/FairfieldTennisCourts/Booking/BookByDate",
  );
});

test("resolveVenueForRun: empty/whitespace/null CLI value falls through to cfg.venue", () => {
  const cfg: LoadedConfig = {
    venue: buildVenueContext("CaberParkTennisCourts"),
    accounts: [{ id: "1", label: "A", username: "u", password: "p" }],
  };
  assert.equal(resolveVenueForRun(cfg, "   ").slug, "CaberParkTennisCourts");
  assert.equal(resolveVenueForRun(cfg, "").slug, "CaberParkTennisCourts");
  assert.equal(resolveVenueForRun(cfg, null).slug, "CaberParkTennisCourts");
  assert.equal(resolveVenueForRun(cfg, undefined).slug, "CaberParkTennisCourts");
});

test("resolveVenueForRun: returns cfg.venue when override matches cfg slug (no rebuild)", () => {
  const cfg: LoadedConfig = {
    venue: buildVenueContext("CaberParkTennisCourts"),
    accounts: [{ id: "1", label: "A", username: "u", password: "p" }],
  };
  const venue = resolveVenueForRun(cfg, "CaberParkTennisCourts");
  assert.equal(venue, cfg.venue, "same slug should reuse the existing context");
});

test("resolveVenueForRun: rejects unsafe override slug", () => {
  const cfg: LoadedConfig = {
    venue: buildVenueContext("CaberParkTennisCourts"),
    accounts: [{ id: "1", label: "A", username: "u", password: "p" }],
  };
  assert.throws(() => resolveVenueForRun(cfg, "bad slug"), /URL-safe/);
});

test("loadConfig: explicit venueSlug wins over venueBaseUrl", () => {
  withTempConfig(
    {
      venueSlug: "ChosenCourts",
      venueBaseUrl: "https://play.tennis.com.au/OtherCourts/Booking/BookByDate",
      accounts: [
        { id: "1", label: "A", username: "u", password: "p", active: true },
      ],
    },
    (p) => {
      const cfg = loadConfig(p);
      assert.equal(cfg.venue.slug, "ChosenCourts");
    },
  );
});
