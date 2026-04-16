import type { Locator, Page } from "playwright";
import type { PlannedJob } from "../../planner/types.js";
import { BOOKING_FLOW, COOKIE_CONSENT, STRIPE_PAY_NOW, bookingUrl } from "./selectors.js";
import { locatorFromSpec } from "./locator.js";

/** Parse jQuery UI `.ui-datepicker-title` text (e.g. `April 2026`, `Apr 2026`). */
function parseMonthYearFromTitle(title: string): { y: number; m: number } | null {
  const cleaned = title.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/([A-Za-z]{3,9})\s*(\d{4})/);
  if (!match) return null;
  const d = new Date(`${match[1]} 1, ${Number(match[2])}`);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function monthIndexKey(year: number, month1Based: number): number {
  return year * 12 + (month1Based - 1);
}

/** Clubspark uses jQuery UI: popup is `#ui-datepicker-div`. Do not use `.ui-datepicker.first()` — another calendar can appear earlier in the DOM (hidden or inline). */
async function attachToOpenDatePicker(page: Page): Promise<Locator> {
  const popup = page.locator("#ui-datepicker-div");
  try {
    await popup.waitFor({ state: "visible", timeout: 15_000 });
    return popup;
  } catch {
    const inline = page
      .locator(".ui-datepicker")
      .filter({ has: page.locator(".ui-datepicker-calendar") })
      .first();
    await inline.waitFor({ state: "visible", timeout: 15_000 });
    return inline;
  }
}

async function clickPickerMonthNav(picker: Locator, dir: "next" | "prev"): Promise<boolean> {
  const sel = dir === "next" ? ".ui-datepicker-next" : ".ui-datepicker-prev";
  const btn = picker.locator(sel);
  if (!(await btn.isVisible().catch(() => false))) return false;
  const disabled = await btn.evaluate((el) => el.classList.contains("ui-state-disabled")).catch(() => true);
  if (disabled) return false;
  await btn.click();
  return true;
}

/** Prefer jQuery UI `td[data-month][data-year]` (0-based month); else only links in cells that are not `.ui-datepicker-other-month` (avoids duplicate day numbers). */
async function clickDayInPicker(picker: Locator, y: number, mo: number, d: number): Promise<void> {
  const dataMonth = mo - 1;
  const byAttrs = picker
    .locator(`td[data-month="${dataMonth}"][data-year="${y}"]`)
    .getByRole("link", { name: String(d), exact: true });
  if ((await byAttrs.count()) > 0) {
    await byAttrs.first().click();
    return;
  }

  const inMonth = picker
    .locator(".ui-datepicker-calendar tbody")
    .locator("td:not(.ui-datepicker-other-month)")
    .getByRole("link", { name: String(d), exact: true });
  const n = await inMonth.count();
  if (n === 0) {
    throw new Error(`Calendar: no selectable day ${d} for ${y}-${String(mo).padStart(2, "0")} (check picker month)`);
  }
  await inMonth.first().click();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match how a slot row may show a wall time (24h or 12h). 24h uses `(?<![0-9])…(?![0-9])` so `9:30`
 * does not match inside `19:30`. Use for **both** start and end when picking a row so `19:30` as the
 * **end** of `18:00–19:30` does not match a planned `19:30–21:30` slot.
 */
export function buildPlannedStartTimePattern(startHHmm: string): RegExp {
  const m = /^(\d{1,2}):(\d{2})$/.exec(startHHmm.trim());
  if (!m) return new RegExp(`(?<![0-9])${escapeRegExp(startHHmm)}(?![0-9])`, "i");
  const H = parseInt(m[1], 10);
  const min = m[2];
  const padded = `${String(H).padStart(2, "0")}:${min}`;
  const unpadded = `${H}:${min}`;
  const h24 = `(?<![0-9])(?:${escapeRegExp(padded)}|${escapeRegExp(unpadded)})(?![0-9])`;
  const h12 = H % 12 === 0 ? 12 : H % 12;
  const ampm = H >= 12 ? "pm" : "am";
  const minNum = parseInt(min, 10);
  const minPadded = String(minNum).padStart(2, "0");
  const h12pat = `${h12}\\s*[:.]\\s*(?:${minPadded}|${minNum})\\s*${ampm}`;
  return new RegExp(`${h24}|${h12pat}`, "i");
}

/**
 * Pick `#booking-duration` option value (end minute). Uses exact `plannedEndMins` when listed; else
 * the **latest** offered end still **≤** planned (venue often caps before the next booking).
 */
export function resolveOverlayEndMinutes(offeredValues: string[], plannedEndMins: number): number {
  const nums = offeredValues.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  if (sorted.length === 0) {
    throw new Error("Duration dropdown has no valid option values");
  }
  if (sorted.includes(plannedEndMins)) return plannedEndMins;
  const atOrUnder = sorted.filter((v) => v <= plannedEndMins);
  if (atOrUnder.length === 0) {
    const minOffered = sorted[0]!;
    throw new Error(
      `No end time on or before planned ${plannedEndMins}m; earliest offered end is ${minOffered}m`,
    );
  }
  return Math.max(...atOrUnder);
}

/** Clubspark grid uses minutes from midnight for `data-test-id` and `#booking-duration` values (30-min steps). */
export function wallTimeToMinutesSinceMidnight(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Invalid HH:mm: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${hhmm}`);
  return h * 60 + min;
}

/** End-time label in Select2 / UI (e.g. `21:30`). */
export function minutesSinceMidnightToHHmm(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function pickDurationSelect2(overlay: Locator, page: Page, endLabel: string): Promise<void> {
  const trigger = overlay.locator(".select2-selection--single").first();
  await trigger.click();
  const results = page
    .locator("#select2-booking-duration-results, .select2-container--open .select2-results")
    .last();
  await results.waitFor({ state: "visible", timeout: 10_000 });
  const tree = results.getByRole("treeitem", { name: endLabel, exact: true });
  if ((await tree.count()) > 0) {
    await tree.first().click();
    return;
  }
  const opt = results.getByRole("option", { name: endLabel, exact: true });
  if ((await opt.count()) > 0) {
    await opt.first().click();
    return;
  }
  await results.locator("li.select2-results__option").filter({ hasText: new RegExp(`^\\s*${endLabel}\\s*$`) }).first().click();
}

/** Parse `Court 3` → `3` for PIN / slot heuristics. */
export function courtNumberFromLabel(courtLabel: string): number {
  const m = courtLabel.match(/(\d+)/);
  if (!m) throw new Error(`Cannot parse court number from label: ${courtLabel}`);
  return Number(m[1]);
}

export type GotoBookingOptions = { role?: "guest" | "member" };

/**
 * Load the book-by-date page for `sessionDate`. Use `{ role: "guest" }` before login; after sign-in,
 * call again **without** `role` (or omit) so `#?date=YYYY-MM-DD` is reapplied — the SignIn redirect
 * otherwise drops the hash and the grid shows today.
 */
export async function gotoBookingForSession(
  page: Page,
  sessionDate: string,
  opts?: GotoBookingOptions,
): Promise<void> {
  await page.goto(bookingUrl({ date: sessionDate, role: opts?.role }), { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
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
 * Open “Select a date” and choose `sessionDate` in the jQuery UI picker, then wait for the grid.
 */
export async function pickSessionDateInCalendar(page: Page, sessionDate: string): Promise<void> {
  const needle = `|${sessionDate}|`;

  const [yStr, moStr, dStr] = sessionDate.split("-");
  const y = Number(yStr);
  const mo = Number(moStr);
  const d = Number(dStr);
  if (!y || !mo || !d) throw new Error(`Invalid sessionDate: ${sessionDate}`);

  const monthLong = new Date(y, mo - 1, 1).toLocaleString("en-AU", { month: "long" });
  const monthHeaderFallback = new RegExp(`${monthLong}\\s*${y}`, "i");
  const targetKey = monthIndexKey(y, mo);

  await locatorFromSpec(page, BOOKING_FLOW.openDatePicker).click();
  const picker = await attachToOpenDatePicker(page);

  for (let step = 0; step < 24; step++) {
    const titleLoc = picker.locator(".ui-datepicker-title");
    if (!(await titleLoc.isVisible().catch(() => false))) continue;

    const t = (await titleLoc.innerText()).replace(/\s+/g, " ").trim();
    const parsed = parseMonthYearFromTitle(t);
    const onTargetMonth =
      parsed != null ? parsed.y === y && parsed.m === mo : monthHeaderFallback.test(t);

    if (onTargetMonth) {
      await clickDayInPicker(picker, y, mo, d);
      await page.locator(`[data-test-id*="${needle}"]`).first().waitFor({ state: "attached", timeout: 30_000 });
      return;
    }

    if (parsed != null) {
      const curKey = monthIndexKey(parsed.y, parsed.m);
      if (curKey < targetKey) {
        if (!(await clickPickerMonthNav(picker, "next"))) {
          throw new Error(`Calendar: cannot go forward toward ${sessionDate}`);
        }
        continue;
      }
      if (curKey > targetKey) {
        if (!(await clickPickerMonthNav(picker, "prev"))) {
          throw new Error(`Calendar: cannot go back toward ${sessionDate}`);
        }
        continue;
      }
    }

    if (await clickPickerMonthNav(picker, "next")) continue;
    if (await clickPickerMonthNav(picker, "prev")) continue;

    throw new Error(`Calendar: stuck navigating (title: "${t}")`);
  }

  throw new Error(`Calendar: could not reach ${sessionDate} (month navigation)`);
}

/** True if visible row copy likely describes this exact slot (not e.g. previous block ending at `job.start`). */
export function rowTextMatchesPlannedSlot(text: string, job: Pick<PlannedJob, "start" | "end">): boolean {
  return (
    buildPlannedStartTimePattern(job.start).test(text) && buildPlannedStartTimePattern(job.end).test(text)
  );
}

/**
 * Click the **bookable** 30-minute cell at `job.start`. Bookable anchors use
 * `a.book-interval.not-booked` and `data-test-id*="|{sessionDate}|{minutes}"`; link text is usually
 * a price, not clock times. Courts share the same minute suffix; DOM order is Court 1, 2, 3.
 */
export async function clickSlotForPlannedJob(page: Page, job: PlannedJob): Promise<void> {
  const startMins = wallTimeToMinutesSinceMidnight(job.start);
  const suffix = `|${job.sessionDate}|${startMins}`;
  const courtIdx = courtNumberFromLabel(job.courtLabel) - 1;
  const cells = page.locator(`a.book-interval.not-booked[data-test-id*="${suffix}"]`);
  const n = await cells.count();
  if (n === 0) {
    throw new Error(
      `No bookable cell at ${job.start} (${startMins}m) on ${job.sessionDate} — interval missing or not \`book-interval not-booked\`.`,
    );
  }
  if (courtIdx < 0 || courtIdx >= n) {
    throw new Error(
      `Court ${job.courtLabel}: index ${courtIdx + 1} but only ${n} bookable column(s) at that time (expected Court 1..${n}).`,
    );
  }
  await cells.nth(courtIdx).click();
}

/**
 * “Make a booking” overlay (`.cs-overlay`): `#booking-duration` options are **end** times as
 * minutes-from-midnight values; then `#submit-booking` (“Continue booking”).
 */
export async function completeBookingDurationOverlay(page: Page, job: PlannedJob): Promise<void> {
  const overlay = page.locator(".cs-overlay");
  const select = overlay.locator("#booking-duration");
  await select.waitFor({ state: "attached", timeout: 15_000 });
  const endMins = wallTimeToMinutesSinceMidnight(job.end);
  const values = await select.locator("option").evaluateAll((opts) =>
    opts.map((o) => (o as HTMLOptionElement).value),
  );
  if (values.length === 0) {
    throw new Error("Duration dropdown has no options (empty #booking-duration in overlay)");
  }
  const chosen = resolveOverlayEndMinutes(values, endMins);
  if (chosen !== endMins) {
    console.error(
      `tennis-booking: end time adjusted from ${job.end} (${endMins}m) to ${chosen}m (latest end ≤ planned; offered: ${values.join(", ")})`,
    );
  }
  const chosenStr = String(chosen);
  const endLabel = minutesSinceMidnightToHHmm(chosen);
  const isSelect2 = await select.evaluate((el) => (el as HTMLElement).classList.contains("select2-hidden-accessible"));

  if (isSelect2) {
    await pickDurationSelect2(overlay, page, endLabel);
  } else {
    try {
      await select.selectOption(chosenStr, { timeout: 10_000 });
    } catch {
      await select.evaluate((el, v: string) => {
        const s = el as HTMLSelectElement;
        s.value = v;
        s.dispatchEvent(new Event("input", { bubbles: true }));
        s.dispatchEvent(new Event("change", { bubbles: true }));
      }, chosenStr);
    }
  }

  await overlay.locator("#submit-booking").click();
}

function confirmPayLocator(page: Page): Locator {
  return page.locator(STRIPE_PAY_NOW).or(page.getByRole("button", { name: "Confirm and pay" }));
}

/** Let basket / Stripe host finish painting after pay CTA is visible (avoids next-step races). */
async function settleAfterPayCtaVisible(page: Page): Promise<void> {
  await page.waitForTimeout(750);
}

/**
 * After overlay **Continue booking** (`#submit-booking`), normal path is basket → **Confirm and pay**
 * (`#paynow` or same-named button). Optional interstitials: another Continue booking, terms, Continue.
 */
export async function proceedThroughTermsToBasket(page: Page): Promise<void> {
  const pay = confirmPayLocator(page);
  try {
    await pay.first().waitFor({ state: "visible", timeout: 20_000 });
    await settleAfterPayCtaVisible(page);
    return;
  } catch {
    /* need intermediate steps */
  }

  try {
    await locatorFromSpec(page, BOOKING_FLOW.continueBooking).click({ timeout: 5000 });
  } catch {
    /* already on basket or payment */
  }

  try {
    await pay.first().waitFor({ state: "visible", timeout: 20_000 });
    await settleAfterPayCtaVisible(page);
    return;
  } catch {
    /* terms path */
  }

  try {
    await locatorFromSpec(page, BOOKING_FLOW.termsAccept).click({ timeout: 8000 });
  } catch {
    if (await pay.first().isVisible().catch(() => false)) {
      await settleAfterPayCtaVisible(page);
      return;
    }
    throw new Error(
      "Basket step: no terms tick (/Please tick this box/) and no Confirm and pay / #paynow — check page state",
    );
  }

  if (await pay.first().isVisible().catch(() => false)) {
    await settleAfterPayCtaVisible(page);
    return;
  }

  try {
    await locatorFromSpec(page, BOOKING_FLOW.continueAfterTerms).click({ timeout: 8000 });
  } catch {
    if (await pay.first().isVisible().catch(() => false)) {
      await settleAfterPayCtaVisible(page);
      return;
    }
    throw new Error("After terms: no Continue button and no Confirm and pay / #paynow");
  }

  await settleAfterPayCtaVisible(page);
}

/** Stripe checkout entry: `#paynow` or “Confirm and pay” button. */
export async function clickConfirmAndPay(page: Page): Promise<void> {
  await confirmPayLocator(page).first().click();
}

/**
 * Full path after you are already on the booking URL and signed in:
 * cookie → calendar → slot → basket (no payment).
 */
export async function bookJobThroughBasket(page: Page, job: PlannedJob): Promise<void> {
  await tryDismissCookieConsent(page);
  await pickSessionDateInCalendar(page, job.sessionDate);
  await clickSlotForPlannedJob(page, job);
  await completeBookingDurationOverlay(page, job);
  await proceedThroughTermsToBasket(page);
}
