import type { Page } from "playwright";
import type { PlannedJob } from "../../planner/types.js";
import { extractCourtPinFromText, type VenueContext } from "./selectors.js";
import { courtNumberFromLabel } from "./bookSlot.js";

/**
 * Read the gate PIN from the **current** `/Booking/BookingConfirmation/{bookingId}` page.
 *
 * Confirmation PIN DOM (one `<li>` per court booked):
 * ```
 * <div class="pin-code-item-container">
 *   <h4>Gate Pin code</h4>
 *   <ul><li>Court 1: 0782</li></ul>
 * </div>
 * ```
 * Reads the card's full `innerText` and regex-extracts the court's row —
 * avoids Playwright's inconsistent regex handling in `filter({ hasText })`.
 *
 * Emits `pin:` prefixed diagnostic lines to `console.error` so an operator can see exactly which
 * step failed (URL mismatch, card not visible, wrong court, etc.) without re-running with a debugger.
 */
export async function readGatePinForJob(
  page: Page,
  ctx: VenueContext,
  job: PlannedJob,
): Promise<string | null> {
  const courtNum = courtNumberFromLabel(job.courtLabel);
  const url = page.url();
  console.error(`pin: url=${url}`);
  console.error(`pin: looking for Court ${courtNum} (job.courtLabel="${job.courtLabel}")`);

  if (!ctx.confirmationUrlRegex.test(url)) {
    console.error(`pin: URL does not match confirmation pattern — waiting up to 15s`);
    try {
      await page.waitForURL(ctx.confirmationUrlRegex, { timeout: 15_000 });
      console.error(`pin: URL settled to ${page.url()}`);
    } catch {
      console.error(`pin: URL never matched; continuing anyway with ${page.url()}`);
    }
  }

  const card = page.locator(".pin-code-item-container").first();
  const cardCount = await page.locator(".pin-code-item-container").count();
  console.error(`pin: .pin-code-item-container count=${cardCount}`);

  try {
    await card.waitFor({ state: "visible", timeout: 20_000 });
    console.error(`pin: card is visible`);
  } catch {
    console.error(`pin: card never became visible within 20s`);
    const bodyTextSample = await page.locator("body").innerText().catch(() => "");
    console.error(`pin: body innerText (first 500 chars): ${bodyTextSample.slice(0, 500).replace(/\n/g, " | ")}`);
    return null;
  }

  const cardText = await card.innerText();
  console.error(`pin: card innerText (raw): ${JSON.stringify(cardText)}`);

  const extracted = extractCourtPinFromText(cardText, courtNum);
  if (extracted) {
    console.error(`pin: extracted PIN for Court ${courtNum}: ${extracted}`);
  } else {
    console.error(`pin: regex did not match — no PIN for Court ${courtNum} in card text`);
  }
  return extracted;
}
