import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium, type Browser } from "playwright";
import { extractGatePinFromManageBookingsDom } from "../src/adapters/clubspark/manageBookingsPin.ts";
import type { PlannedJob } from "../src/planner/types.ts";

/** Minimal slice of Clubspark “Your bookings” HTML (note `Class` on divs as served). */
const MY_BOOKINGS_HTML = `<!DOCTYPE html><html><body><section id="my-bookings-view">
<div class="panel-group style-11 js-my-bookings-container">
<div Class="block-panel">
<div Class="block-panel-header"><div Class="block-panel-title">
<h2> Mon, 27 Apr 2026, 19:00 - 19:30 </h2>
</div></div>
<div class="block-panel-body"><div class="block-panel-row"><ul>
<li><span class="block-panel-row-label"> Resource(s) </span><span class="block-panel-row-value"> Court 2 </span></li>
<li><span class="block-panel-row-label"> Gate Pin: </span><span class="block-panel-row-value">0782</span><br /></li>
</ul></div></div></div>
</div></section></body></html>`;

function job(overrides: Partial<PlannedJob> = {}): PlannedJob {
  return {
    sequence: 1,
    accountId: "a1",
    courtLabel: "Court 2",
    start: "19:00",
    end: "19:30",
    sessionDate: "2026-04-27",
    ...overrides,
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

test("extractGatePinFromManageBookingsDom reads Resource(s) + Gate Pin rows (Clubspark DOM)", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(MY_BOOKINGS_HTML);
    const pin = await extractGatePinFromManageBookingsDom(page, job());
    assert.equal(pin, "0782");
  } finally {
    await context.close();
  }
});

test("extractGatePinFromManageBookingsDom picks court by Resource(s) when two panels share a day", async () => {
  const two = `<!DOCTYPE html><html><body><section id="my-bookings-view"><div class="panel-group">
<div Class="block-panel"><div Class="block-panel-title"><h2>Mon, 27 Apr 2026, 19:00 - 19:30</h2></div>
<div class="block-panel-body"><div class="block-panel-row"><ul>
<li><span class="block-panel-row-label">Resource(s)</span><span class="block-panel-row-value">Court 1</span></li>
<li><span class="block-panel-row-label">Gate Pin:</span><span class="block-panel-row-value">1111</span></li>
</ul></div></div></div>
<div Class="block-panel"><div Class="block-panel-title"><h2>Mon, 27 Apr 2026, 19:30 - 22:00</h2></div>
<div class="block-panel-body"><div class="block-panel-row"><ul>
<li><span class="block-panel-row-label">Resource(s)</span><span class="block-panel-row-value">Court 2</span></li>
<li><span class="block-panel-row-label">Gate Pin:</span><span class="block-panel-row-value">2222</span></li>
</ul></div></div></div>
</div></section></body></html>`;
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(two);
    assert.equal(
      await extractGatePinFromManageBookingsDom(page, job({ courtLabel: "Court 2", start: "19:30", end: "22:00" })),
      "2222",
    );
    assert.equal(
      await extractGatePinFromManageBookingsDom(page, job({ courtLabel: "Court 1", start: "19:00", end: "19:30" })),
      "1111",
    );
  } finally {
    await context.close();
  }
});
