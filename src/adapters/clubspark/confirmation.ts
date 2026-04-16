import type { Page } from "playwright";
import type { PlannedJob } from "../../planner/types.js";
import { CABER_PARK_MANAGE_BOOKINGS } from "./selectors.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateForBookingMatch(sessionDate: string): string {
  const [year, month, day] = sessionDate.split("-");
  return `${parseInt(day)} ${MONTHS[parseInt(month) - 1]} ${year}`;
}

/**
 * Read gate PIN by navigating to the manage-bookings page, finding the panel
 * that matches this job's date/time/court, clicking "View details", and
 * extracting the PIN from the booking detail page.
 */
export async function readGatePinForJob(page: Page, job: PlannedJob): Promise<string | null> {
  await page.goto(CABER_PARK_MANAGE_BOOKINGS);
  await page.locator(".js-my-bookings-container").waitFor({ state: "visible", timeout: 30_000 });

  const dateStr = formatDateForBookingMatch(job.sessionDate);
  const timePattern = new RegExp(`${dateStr}.*${job.start}\\s*-\\s*${job.end}`);
  const panel = page
    .locator(".block-panel")
    .filter({ hasText: timePattern })
    .filter({ hasText: job.courtLabel });

  if ((await panel.count()) === 0) return null;

  await panel.locator("a.cs-btn.tertiary.sm").first().click();

  await page.locator(".js-resource-pins-container").waitFor({ state: "visible", timeout: 15_000 });
  const pinEl = page.locator(".js-resource-pins-container .value").first();
  if ((await pinEl.count()) === 0) return null;
  const text = await pinEl.innerText();
  return text.trim() || null;
}
