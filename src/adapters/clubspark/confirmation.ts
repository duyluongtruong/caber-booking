import type { Page } from "playwright";
import type { PlannedJob } from "../../planner/types.js";
import { confirmationCourtLine, parseGatePinFromCourtRow } from "./selectors.js";
import { courtNumberFromLabel } from "./bookSlot.js";
import { locatorFromSpec } from "./locator.js";

/** Read gate PIN from confirmation page for the job’s court (e.g. `Court 3: 0782`). */
export async function readGatePinForJob(page: Page, job: PlannedJob): Promise<string | null> {
  const n = courtNumberFromLabel(job.courtLabel);
  const loc = locatorFromSpec(page, confirmationCourtLine(n)).first();
  const text = await loc.innerText();
  return parseGatePinFromCourtRow(text);
}
