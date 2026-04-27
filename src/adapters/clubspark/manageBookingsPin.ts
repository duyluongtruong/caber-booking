import { setTimeout as sleep } from "node:timers/promises";
import type { Browser, Page } from "playwright";
import type { ConfigAccount } from "../../loadConfig.js";
import type { PlannedJob } from "../../planner/types.js";
import { login } from "./auth.js";
import { courtNumberFromLabel, gotoBookingForSession, tryDismissCookieConsent } from "./bookSlot.js";
import { extractCourtPinFromText, type VenueContext } from "./selectors.js";

const MONTH_ABBREVS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Normalize `H:mm` or `HH:mm` to `HH:mm`. */
export function normalizeHHmm(raw: string): string {
  const [h, m] = raw.trim().split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw.trim();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Parse Caber Park “Your bookings” panel title, e.g.
 * `Mon, 27 Apr 2026, 19:30 - 22:00`.
 */
export function parseMyBookingsPanelHeader(line: string): { sessionDate: string; start: string; end: string } | null {
  const cleaned = line.replace(/\s+/g, " ").trim();
  const m = cleaned.match(
    /^(?:[A-Za-z]{3,9},\s*)?(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})\s*,\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i,
  );
  if (!m) return null;
  const day = Number(m[1]);
  const monthKey = m[2].toLowerCase().slice(0, 3);
  const mo = MONTH_ABBREVS[monthKey];
  const y = Number(m[3]);
  if (mo === undefined || !y || !day) return null;
  const sessionDate = `${y}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    sessionDate,
    start: normalizeHHmm(m[4]),
    end: normalizeHHmm(m[5]),
  };
}

/** Public for unit tests — parses PIN from Manage bookings list body text. */
export function dateHintStrings(sessionDate: string): string[] {
  const parts = sessionDate.split("-");
  if (parts.length !== 3) return [sessionDate];
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !mo || !d) return [sessionDate];
  const dt = new Date(y, mo - 1, d);
  const out = new Set<string>();
  out.add(sessionDate);
  out.add(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  out.add(dt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  out.add(dt.toLocaleDateString("en-AU"));
  out.add(dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }));
  out.add(dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }));
  const dd = String(d).padStart(2, "0");
  const mm = String(mo).padStart(2, "0");
  out.add(`${dd}/${mm}/${y}`);
  out.add(`${d}/${mo}/${y}`);
  return [...out];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the segment contains the **exact** wall-clock window as shown on My bookings titles,
 * e.g. `19:00 - 19:30` or `19:00 – 19:30` (ASCII hyphen or en dash).
 *
 * We do **not** treat start/end as independent substrings: otherwise a `19:30–22:00` Court 1 row
 * incorrectly matches a job `19:00–19:30` because `19:30` appears in both.
 */
export function bookingClockWindowAppearsInText(segment: string, job: PlannedJob): boolean {
  const a = normalizeHHmm(job.start);
  const b = normalizeHHmm(job.end);
  const re = new RegExp(`${escapeRegExp(a)}\\s*[-–\\u2013]\\s*${escapeRegExp(b)}`);
  return re.test(segment);
}

/** True if `segment` text clearly refers to `job.sessionDate` (ISO hints, panel title line, or spelled-out day/month). */
export function segmentSessionDateMatches(segment: string, job: PlannedJob): boolean {
  const hints = dateHintStrings(job.sessionDate);
  if (hints.some((h) => segment.includes(h))) return true;

  for (const line of segment.split("\n")) {
    const parsed = parseMyBookingsPanelHeader(line.trim());
    if (parsed?.sessionDate === job.sessionDate) return true;
  }

  const parts = job.sessionDate.split("-");
  if (parts.length !== 3) return false;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  const dt = new Date(y, mo - 1, d);
  const monthLong = dt.toLocaleDateString("en-AU", { month: "long" });
  const compact = `${d} ${monthLong}`;
  if (segment.toLowerCase().includes(compact.toLowerCase())) return true;
  const withWeek = dt.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  if (segment.includes(withWeek)) return true;

  return false;
}

/** Whether a text chunk (e.g. one booking card) matches the planned job’s date, time, and court. */
export function segmentMatchesBooking(segment: string, job: PlannedJob): boolean {
  const n = courtNumberFromLabel(job.courtLabel);
  if (!new RegExp(`\\bCourt\\s*${n}\\b`, "i").test(segment)) return false;
  if (!bookingClockWindowAppearsInText(segment, job)) return false;
  return segmentSessionDateMatches(segment, job);
}

function extractPinFromMatchedSegment(segment: string, job: PlannedJob): string | null {
  const gatePin = segment.match(/gate\s+pin\s*:?\s*(\d{4})\b/i);
  if (gatePin) return gatePin[1];
  const n = courtNumberFromLabel(job.courtLabel);
  const fromCourt = extractCourtPinFromText(segment, n);
  if (fromCourt) return fromCourt;
  const labelled = segment.match(
    /\b(?:gate\s*)?(?:pin|access\s*code)(?:\s*code)?\s*:?\s*(\d{4})\b/i,
  );
  if (labelled) return labelled[1];
  return null;
}

/**
 * Find the gate PIN in Manage bookings page body text by matching date, time window, and court,
 * then reading `Gate Pin:` / `Court N: ####` / labelled PIN lines.
 *
 * Never treats the **entire** `body.innerText` as one segment: that joins unrelated panels and
 * produces false positives (e.g. Court 1 elsewhere + `19:00–19:30` from Court 2’s title).
 *
 * Sliding windows run **only inside each paragraph** (split by blank lines between panels),
 * never across the full document — otherwise a line `Court 1` from one panel can combine with
 * `19:00 - 19:30` from the next panel’s title.
 */
export function extractGatePinFromManageBookingsBodyText(fullText: string, job: PlannedJob): string | null {
  const paragraphs = fullText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  for (const para of paragraphs) {
    const seen = new Set<string>();
    seen.add(para);
    if (segmentMatchesBooking(para, job)) {
      const pin = extractPinFromMatchedSegment(para, job);
      if (pin) return pin;
    }

    const lines = para.split("\n").map((s) => s.trim());
    for (let i = 0; i < lines.length; i++) {
      for (let w = 3; w <= 16 && i + w <= lines.length; w++) {
        const chunk = lines.slice(i, i + w).join("\n");
        if (seen.has(chunk)) continue;
        seen.add(chunk);
        if (!segmentMatchesBooking(chunk, job)) continue;
        const pin = extractPinFromMatchedSegment(chunk, job);
        if (pin) return pin;
      }
    }
  }

  return null;
}

/**
 * My bookings `h2` often shows a **longer** end time than a single `PlannedJob` (e.g. venue shows
 * `19:30 - 22:00` while one checkout was `19:30 - 21:00`). We match **session date + start time**
 * on the title and rely on **Resource(s) → Court N** for the correct panel.
 */
export function myBookingsPanelHeaderMatchesJob(h2Text: string, job: PlannedJob): boolean {
  const parsed = parseMyBookingsPanelHeader(h2Text);
  if (!parsed) return false;
  if (parsed.sessionDate !== job.sessionDate) return false;
  if (parsed.start !== normalizeHHmm(job.start)) return false;
  return true;
}

/**
 * Clubspark “Your bookings” DOM: `.block-panel` with `h2` time range, `Resource(s)` court,
 * `Gate Pin:` + `.block-panel-row-value`.
 */
export async function extractGatePinFromManageBookingsDom(page: Page, job: PlannedJob): Promise<string | null> {
  const courtNum = courtNumberFromLabel(job.courtLabel);
  const panels = page.locator("#my-bookings-view .block-panel");
  await panels
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});
  const n = await panels.count();
  if (n === 0) {
    console.error(`pin: manage bookings — DOM: no .block-panel under #my-bookings-view`);
  }
  for (let i = 0; i < n; i++) {
    const panel = panels.nth(i);
    const h2 = (await panel.locator(".block-panel-title h2, h2").first().innerText().catch(() => "")).trim();
    if (!myBookingsPanelHeaderMatchesJob(h2, job)) continue;

    // Inner locator must use `page`, not `panel`: with `panel.locator(...)` Playwright does not
    // re-scope the `has` target under each `li`, so Resource/Gate rows never match (real HTML).
    const resourceLi = panel.locator("li").filter({
      has: page.locator(".block-panel-row-label", { hasText: /Resource/i }),
    });
    const resourceVal = (await resourceLi.locator(".block-panel-row-value").first().innerText().catch(() => "")).trim();
    if (!new RegExp(`^Court\\s*${courtNum}\\s*$`, "i").test(resourceVal)) continue;

    const pinLi = panel.locator("li").filter({
      has: page.locator(".block-panel-row-label", { hasText: /Gate\s+Pin/i }),
    });
    const pinRaw = (await pinLi.locator(".block-panel-row-value").first().innerText().catch(() => "")).trim();
    if (/^\d{4}$/.test(pinRaw)) return pinRaw;
  }
  if (n > 0) {
    console.error(
      `pin: manage bookings — DOM: ${n} panel(s) but none matched ${job.courtLabel} on ${job.sessionDate} at start ${job.start} (check h2 start time + Resource(s) row)`,
    );
  }
  return null;
}

async function ensureManageBookingsWhileLoggedIn(
  page: Page,
  ctx: VenueContext,
  account: ConfigAccount,
  job: PlannedJob,
): Promise<void> {
  await page.goto(ctx.manageBookings, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const url = page.url().toLowerCase();
  const signInHeading = await page.getByRole("heading", { name: /^sign in$/i }).count().catch(() => 0);
  const emailBox = await page.getByRole("textbox", { name: "Email address" }).isVisible().catch(() => false);
  const needsLogin =
    signInHeading > 0 ||
    emailBox ||
    url.includes("/account/signin") ||
    url.includes("signin");

  if (needsLogin) {
    await gotoBookingForSession(page, ctx, job.sessionDate, { role: "guest" });
    await login(page, account.username, account.password);
    await tryDismissCookieConsent(page);
    await page.goto(ctx.manageBookings, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
}

/**
 * Opens a **new** browser context, signs in if needed, loads Manage bookings, polls until the PIN
 * for `job` appears (new bookings can lag a few seconds).
 */
export async function readGatePinFromManageBookings(
  browser: Browser,
  ctx: VenueContext,
  account: ConfigAccount,
  job: PlannedJob,
): Promise<string | null> {
  const context = await browser.newContext();
  const page = await context.newPage();
  console.error(`pin: manage bookings — new context, ${ctx.manageBookings}`);
  try {
    await ensureManageBookingsWhileLoggedIn(page, ctx, account, job);
    const deadline = Date.now() + 90_000;
    let attempt = 0;
    while (Date.now() < deadline) {
      attempt += 1;
      await page.locator("#my-bookings-view").waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
      let pin = await extractGatePinFromManageBookingsDom(page, job);
      if (pin) {
        console.error(
          `pin: manage bookings — DOM extracted PIN for Court ${courtNumberFromLabel(job.courtLabel)}: ${pin}`,
        );
        return pin;
      }
      const bodyText = await page.locator("body").innerText().catch(() => "");
      console.error(`pin: manage bookings — scrape attempt ${attempt}, body length=${bodyText.length}`);
      pin = extractGatePinFromManageBookingsBodyText(bodyText, job);
      if (pin) {
        console.error(
          `pin: manage bookings — text extracted PIN for Court ${courtNumberFromLabel(job.courtLabel)}: ${pin}`,
        );
        return pin;
      }
      await sleep(3000);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle").catch(() => {});
    }
    console.error(`pin: manage bookings — no PIN matched job after polling`);
    return null;
  } finally {
    await context.close();
  }
}
