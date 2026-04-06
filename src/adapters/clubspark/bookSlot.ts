import type { Page } from "playwright";
import type { PlannedJob } from "../../planner/types.js";
import {
  BOOKING_FLOW,
  COOKIE_CONSENT,
  bookingUrl,
  calendarDayLink,
} from "./selectors.js";
import { locatorFromSpec } from "./locator.js";

/** Parse `Court 3` → `3` for PIN / slot heuristics. */
export function courtNumberFromLabel(courtLabel: string): number {
  const m = courtLabel.match(/(\d+)/);
  if (!m) throw new Error(`Cannot parse court number from label: ${courtLabel}`);
  return Number(m[1]);
}

export async function gotoBookingForSession(page: Page, sessionDate: string): Promise<void> {
  await page.goto(bookingUrl({ date: sessionDate, role: "guest" }), { waitUntil: "domcontentloaded" });
}

/** Close cookie banner if present; ignore if not. */
export async function tryDismissCookieConsent(page: Page, timeoutMs = 5000): Promise<void> {
  try {
    await locatorFromSpec(page, COOKIE_CONSENT.close).click({ timeout: timeoutMs });
  } catch {
    /* optional */
  }
}

/**
 * Open calendar and select `sessionDate` (uses month name + year text, then day link).
 * Limited: if the picker UI differs, update selectors / logic from a new spike.
 */
export async function pickSessionDateInCalendar(page: Page, sessionDate: string): Promise<void> {
  const [yStr, moStr, dStr] = sessionDate.split("-");
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  if (!y || !mo || !d) throw new Error(`Invalid sessionDate: ${sessionDate}`);

  const monthLong = new Date(y, mo - 1, 1).toLocaleString("en-AU", { month: "long" });
  const monthHeader = new RegExp(`${monthLong}\\s*${y}`, "i");

  await locatorFromSpec(page, BOOKING_FLOW.openDatePicker).click();

  for (let step = 0; step < 24; step++) {
    const headerHit = page.getByText(monthHeader);
    if ((await headerHit.count()) > 0 && (await headerHit.first().isVisible())) {
      await locatorFromSpec(page, calendarDayLink(d)).click();
      return;
    }
    await locatorFromSpec(page, BOOKING_FLOW.calendarNextMonth).click();
  }

  throw new Error(`Calendar: could not reach ${sessionDate} (month navigation)`);
}

/**
 * Click the grid cell for this job. Prefers rows that include `courtLabel`; if several share
 * the same date fragment, uses court index from the label as a fallback `nth`.
 */
export async function clickSlotForPlannedJob(page: Page, job: PlannedJob): Promise<void> {
  const needle = `|${job.sessionDate}|`;
  const rows = page.locator(`[data-test-id*="${needle}"]`);
  const count = await rows.count();
  if (count === 0) {
    throw new Error(`No booking slot found for date ${job.sessionDate}`);
  }

  let target = rows.filter({ hasText: job.courtLabel });
  if ((await target.count()) === 0) {
    target = rows;
  }

  const tcount = await target.count();
  if (tcount === 0) throw new Error(`No slot row matched court/date for ${job.courtLabel}`);

  const clickTarget =
    tcount > 1
      ? target.nth(Math.max(0, Math.min(courtNumberFromLabel(job.courtLabel) - 1, tcount - 1)))
      : target.first();

  await clickTarget.click();
}

/** Continue booking → accept terms → Continue (stops before “Confirm and pay”). */
export async function proceedThroughTermsToBasket(page: Page): Promise<void> {
  await locatorFromSpec(page, BOOKING_FLOW.continueBooking).click();
  await locatorFromSpec(page, BOOKING_FLOW.termsAccept).click();
  await locatorFromSpec(page, BOOKING_FLOW.continueAfterTerms).click();
}

export async function clickConfirmAndPay(page: Page): Promise<void> {
  await locatorFromSpec(page, BOOKING_FLOW.confirmAndPay).click();
}

/**
 * Full path after you are already on the booking URL and signed in:
 * cookie → calendar → slot → basket (no payment).
 */
export async function bookJobThroughBasket(page: Page, job: PlannedJob): Promise<void> {
  await tryDismissCookieConsent(page);
  await pickSessionDateInCalendar(page, job.sessionDate);
  await clickSlotForPlannedJob(page, job);
  await proceedThroughTermsToBasket(page);
}
