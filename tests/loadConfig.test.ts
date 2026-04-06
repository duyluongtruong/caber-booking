import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../src/loadConfig.ts";

const fixturePath = path.join(import.meta.dirname, "fixtures", "accounts.sample.json");

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
