import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { readGatePinForJob } from "../src/adapters/clubspark/confirmation.ts";
import { buildVenueContext } from "../src/adapters/clubspark/selectors.ts";
import type { PlannedJob } from "../src/planner/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures/confirmation-court1.html");
const FIXTURE_HTML = readFileSync(FIXTURE_PATH, "utf8");

const VENUE_CTX = buildVenueContext("CaberParkTennisCourts");

/** URL that matches `VENUE_CTX.confirmationUrlRegex`. */
const CONFIRMATION_URL =
  "https://play.tennis.com.au/CaberParkTennisCourts/Booking/BookingConfirmation/11d906d2-adb2-44ce-ab6f-23f5eac96d5f";

function makeJob(courtLabel: string): PlannedJob {
  return {
    sequence: 1,
    accountId: "acct-1",
    courtLabel,
    start: "19:00",
    end: "19:30",
    sessionDate: "2026-05-04",
  };
}

let browser: Browser;
let originalConsoleError: typeof console.error;

before(async () => {
  browser = await chromium.launch({ headless: true });
  originalConsoleError = console.error;
  console.error = () => {};
});

after(async () => {
  console.error = originalConsoleError;
  if (browser) await browser.close();
});

/**
 * Serves {@link FIXTURE_HTML} for any request matching the Clubspark confirmation URL so
 * `readGatePinForJob` sees both the expected URL and the expected DOM — mirroring what
 * `payWithCard`'s `waitForURL` lands on in production.
 */
async function openFixturePage(html = FIXTURE_HTML): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("**/CaberParkTennisCourts/Booking/BookingConfirmation/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html }),
  );
  await page.goto(CONFIRMATION_URL);
  return page;
}

test("readGatePinForJob extracts the PIN from the real Clubspark confirmation HTML (Court 1 → 0782)", async () => {
  const page = await openFixturePage();
  try {
    const pin = await readGatePinForJob(page, VENUE_CTX, makeJob("Court 1"));
    assert.equal(pin, "0782");
  } finally {
    await page.context().close();
  }
});

test("readGatePinForJob returns null when the booked court isn't in the PIN card", async () => {
  const page = await openFixturePage();
  try {
    const pin = await readGatePinForJob(page, VENUE_CTX, makeJob("Court 2"));
    assert.equal(pin, null);
  } finally {
    await page.context().close();
  }
});

test("readGatePinForJob handles a multi-court basket (Court 1, 2, 3 each resolve correctly)", async () => {
  const multi = FIXTURE_HTML.replace(
    "<li>Court 1: 0782</li>",
    "<li>Court 1: 0782</li> <li>Court 2: 1234</li> <li>Court 3: 9999</li>",
  );
  const page = await openFixturePage(multi);
  try {
    assert.equal(await readGatePinForJob(page, VENUE_CTX, makeJob("Court 1")), "0782");
    assert.equal(await readGatePinForJob(page, VENUE_CTX, makeJob("Court 2")), "1234");
    assert.equal(await readGatePinForJob(page, VENUE_CTX, makeJob("Court 3")), "9999");
  } finally {
    await page.context().close();
  }
});

test("readGatePinForJob does not mismatch Court 1 against Court 10 in the same card", async () => {
  const withCourt10 = FIXTURE_HTML.replace(
    "<li>Court 1: 0782</li>",
    "<li>Court 10: 5555</li>",
  );
  const page = await openFixturePage(withCourt10);
  try {
    assert.equal(await readGatePinForJob(page, VENUE_CTX, makeJob("Court 1")), null);
    assert.equal(await readGatePinForJob(page, VENUE_CTX, makeJob("Court 10")), "5555");
  } finally {
    await page.context().close();
  }
});
