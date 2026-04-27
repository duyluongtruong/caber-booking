#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { loadConfig, resolveConfigPath, resolveVenueForRun } from "./loadConfig.js";
import { login } from "./adapters/clubspark/auth.js";
import {
  clickSlotForPlannedJob,
  completeBookingDurationOverlay,
  gotoBookingForSession,
  pickSessionDateInCalendar,
  proceedThroughTermsToBasket,
  clickConfirmAndPay,
  tryDismissCookieConsent,
} from "./adapters/clubspark/bookSlot.js";
import { planJobs } from "./planner/planJobs.js";
import { buildMondayThreeCourtTemplate } from "./mondayPlan.js";
import { resolveSessionDate } from "./sessionDate.js";
import {
  dryRunBookOneSession,
  runAdHocBookingSession,
  runBookingSession,
} from "./runner/runSession.js";
import { getCardInput } from "./prompts/readCard.js";
import {
  bookOneRequestedSpanExceedsTwoHours,
  planBookOneJobs,
  resolveBookOneStartEnd,
  resolveCourtForBookOne,
} from "./bookOnePlan.js";
import { readGatePinFromManageBookings } from "./adapters/clubspark/manageBookingsPin.js";
import { assertIsoDate } from "./sessionDate.js";
import type { PlannedJob } from "./planner/types.js";

const program = new Command()
  .name("tennis-booking")
  .description(
    "Local helper for multi-account Clubspark booking (venue selected via config: venueSlug)",
  );

function resolveCliConfigPath(config?: string): string {
  return config
    ? path.isAbsolute(config)
      ? config
      : path.resolve(process.cwd(), config)
    : resolveConfigPath();
}

const configCmd = new Command("config").description("Account JSON on disk");

configCmd
  .command("check")
  .description("Validate accounts file; print label, id, and username only (never passwords)")
  .option("-c, --config <path>", "accounts JSON path (else TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .action((opts: { config?: string }) => {
    const configPath = resolveCliConfigPath(opts.config);

    if (!existsSync(configPath)) {
      console.error(`tennis-booking: config file not found: ${configPath}`);
      process.exitCode = 1;
      return;
    }

    try {
      const cfg = loadConfig(configPath);
      for (const a of cfg.accounts) {
        console.log(`${a.label}\t${a.id}\t${a.username}`);
      }
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program.addCommand(configCmd);

program
  .command("dry-run")
  .description(
    "Plan Monday 19:30–22:00 (3 courts); open browser and walk the first planned job through basket only (no payment)",
  )
  .option("-d, --date <yyyy-mm-dd>", "Session date (overrides --weeks)")
  .option(
    "-w, --weeks <n>",
    "How many Mondays ahead: 0 = upcoming Monday, 1 = the next Monday, … (used if --date omitted)",
    (v) => parseInt(v, 10),
  )
  .option("-c, --config <path>", "accounts JSON (default: env TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .option(
    "--venue <slug>",
    "Override venue slug for this run (default: cfg.venueSlug from config). Same accounts; different Clubspark venue URL.",
  )
  .option("--headless", "Run headless (default: headed)", false)
  .action(async (opts: { date?: string; weeks?: number; config?: string; headless: boolean; venue?: string }) => {
    const configPath = resolveCliConfigPath(opts.config);

    if (!existsSync(configPath)) {
      console.error(`tennis-booking: config file not found: ${configPath}`);
      process.exitCode = 1;
      return;
    }

    let cfg;
    try {
      cfg = loadConfig(configPath);
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    let venue;
    try {
      venue = resolveVenueForRun(cfg, opts.venue);
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    let sessionDate: string;
    try {
      sessionDate = resolveSessionDate({ date: opts.date, weeks: opts.weeks });
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    let jobs;
    try {
      jobs = planJobs(cfg.accounts, buildMondayThreeCourtTemplate(sessionDate));
    } catch (e) {
      console.error("tennis-booking: plan failed:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    console.error(
      `dry-run: venue ${venue.slug} — session ${sessionDate} — ${jobs.length} planned job(s) (3 courts, Mon evening)`,
    );
    for (const j of jobs) {
      console.error(`  ${j.sequence}. ${j.courtLabel} ${j.start}-${j.end} → account ${j.accountId}`);
    }

    const job = jobs[0];
    const account = cfg.accounts.find((a) => a.id === job.accountId);
    if (!account) {
      console.error(`tennis-booking: no config account for job 1 (${job.accountId})`);
      process.exitCode = 1;
      return;
    }

    console.error(
      `dry-run: browser uses job 1 only — ${account.label} (${account.username}) / ${job.courtLabel} (password not logged)`,
    );

    const browser = await chromium.launch({ headless: opts.headless });
    const page = await browser.newPage();

    try {
      await gotoBookingForSession(page, venue, sessionDate, { role: "guest" });
      await login(page, account.username, account.password);
      await gotoBookingForSession(page, venue, sessionDate);
      await tryDismissCookieConsent(page);
      await pickSessionDateInCalendar(page, sessionDate);
      await clickSlotForPlannedJob(page, job);
      await completeBookingDurationOverlay(page, job);
      await proceedThroughTermsToBasket(page);
      await clickConfirmAndPay(page);

      console.error(
        "dry-run: reached checkout (Confirm and pay / #paynow visible if applicable — not clicked). Inspect the browser.",
      );
      if (opts.headless) {
        await page.waitForTimeout(15_000);
      } else {
        await page.pause();
      }
    } finally {
      await browser.close();
    }
  });

program
  .command("run")
  .description(
    "Plan Monday 19:30–22:00 for Court 1–3; run every planned job (separate login/checkout each — multiple card charges)",
  )
  .option("-d, --date <yyyy-mm-dd>", "Session date (overrides --weeks)")
  .option(
    "-w, --weeks <n>",
    "How many Mondays ahead: 0 = upcoming Monday, 1 = the next Monday, … (used if --date omitted)",
    (v) => parseInt(v, 10),
  )
  .option("-c, --config <path>", "accounts JSON")
  .option(
    "--venue <slug>",
    "Override venue slug for this run (default: cfg.venueSlug from config). Same accounts; different Clubspark venue URL.",
  )
  .option("--headless", "Run headless (default: headed)", false)
  .action(async (opts: { date?: string; weeks?: number; config?: string; headless: boolean; venue?: string }) => {
    const configPath = resolveCliConfigPath(opts.config);

    if (!existsSync(configPath)) {
      console.error(`tennis-booking: config file not found: ${configPath}`);
      process.exitCode = 1;
      return;
    }

    let cfg;
    try {
      cfg = loadConfig(configPath);
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    let venue;
    try {
      venue = resolveVenueForRun(cfg, opts.venue);
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    let sessionDate: string;
    try {
      sessionDate = resolveSessionDate({ date: opts.date, weeks: opts.weeks });
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    console.error(
      `run: venue ${venue.slug} — session ${sessionDate} — card details will be loaded from config/card.local.json if present, else prompted (not logged).`,
    );

    let card;
    try {
      card = await getCardInput();
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }

    try {
      await runBookingSession({
        configPath,
        sessionDate,
        headless: opts.headless,
        card,
        venue,
      });
    } catch (e) {
      console.error("tennis-booking: run failed:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program
  .command("book-one")
  .description(
    "Plan one court for a session date (≤2h per checkout); run or dry-run each planned job",
  )
  .requiredOption("-d, --date <yyyy-mm-dd>", "Session date (required)")
  .option("--court <label-or-number>", "Court (default: 1)")
  .option("--start <HH:mm>", "Window start (or defaultSessionStart in config)")
  .option("--end <HH:mm>", "Window end (or defaultSessionEnd in config)")
  .option("--account <id>", "Use only this booking account id for all jobs")
  .option("-c, --config <path>", "accounts JSON (default: env TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .option(
    "--venue <slug>",
    "Override venue slug for this run (default: cfg.venueSlug from config). Same accounts; different Clubspark venue URL.",
  )
  .option("--headless", "Run headless (default: headed)", false)
  .option("--dry-run", "Walk each job to checkout only (no payment)", false)
  .action(
    async (opts: {
      date: string;
      court?: string;
      start?: string;
      end?: string;
      account?: string;
      config?: string;
      venue?: string;
      headless: boolean;
      dryRun: boolean;
    }) => {
      const configPath = resolveCliConfigPath(opts.config);

      if (!existsSync(configPath)) {
        console.error(`tennis-booking: config file not found: ${configPath}`);
        process.exitCode = 1;
        return;
      }

      let cfg;
      try {
        cfg = loadConfig(configPath);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let venue;
      try {
        venue = resolveVenueForRun(cfg, opts.venue);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let window: { start: string; end: string };
      try {
        window = resolveBookOneStartEnd(cfg, opts.start, opts.end);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let jobs;
      try {
        jobs = planBookOneJobs(cfg, {
          sessionDate: opts.date,
          courtArg: opts.court,
          start: opts.start,
          end: opts.end,
          accountId: opts.account,
        });
      } catch (e) {
        console.error("tennis-booking: plan failed:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      console.error(`book-one: venue ${venue.slug} — session ${opts.date} — ${jobs.length} planned job(s) (one court)`);
      if (bookOneRequestedSpanExceedsTwoHours(window.start, window.end)) {
        console.error(
          `book-one: requested window ${window.start}–${window.end} is longer than 2h; planned checkouts:`,
        );
        for (const j of jobs) {
          console.error(`  ${j.sequence}. ${j.courtLabel} ${j.start}-${j.end} → account ${j.accountId}`);
        }
      }

      if (opts.dryRun) {
        try {
          await dryRunBookOneSession({ configPath, jobs, headless: opts.headless, venue });
        } catch (e) {
          console.error("tennis-booking: book-one dry-run failed:", e instanceof Error ? e.message : e);
          process.exitCode = 1;
        }
        return;
      }

      console.error(
        "book-one: card details loaded from config/card.local.json if present, else prompted when the first job reaches payment (not logged).",
      );

      try {
        await runAdHocBookingSession({
          configPath,
          jobs,
          headless: opts.headless,
          getCardWhenNeeded: getCardInput,
          venue,
        });
      } catch (e) {
        console.error("tennis-booking: book-one failed:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
      }
    },
  );

program
  .command("read-pin")
  .description(
    "Open Manage bookings for an account and print the gate PIN for a session/court/time (no payment; for testing the PIN scraper)",
  )
  .requiredOption("-d, --date <yyyy-mm-dd>", "Session date (must match the booking row on My bookings)")
  .requiredOption("-a, --account <id>", "Account id from config (whose Clubspark login / bookings list to use)")
  .option("--court <label-or-number>", "Court (default: 1)")
  .option("--start <HH:mm>", "Start time shown in the booking panel title (or defaultSessionStart from config)")
  .option("--end <HH:mm>", "End time in the panel title (or defaultSessionEnd from config)")
  .option("-c, --config <path>", "accounts JSON (default: env TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .option(
    "--venue <slug>",
    "Override venue slug for this run (default: cfg.venueSlug from config). Same accounts; different Clubspark venue URL.",
  )
  .option("--headless", "Run headless (default: headed)", false)
  .action(
    async (opts: {
      date: string;
      account: string;
      court?: string;
      start?: string;
      end?: string;
      config?: string;
      venue?: string;
      headless: boolean;
    }) => {
      const configPath = resolveCliConfigPath(opts.config);

      if (!existsSync(configPath)) {
        console.error(`tennis-booking: config file not found: ${configPath}`);
        process.exitCode = 1;
        return;
      }

      let cfg;
      try {
        cfg = loadConfig(configPath);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let venue;
      try {
        venue = resolveVenueForRun(cfg, opts.venue);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      const account = cfg.accounts.find((x) => x.id === opts.account);
      if (!account) {
        console.error(
          `tennis-booking: no active account with id "${opts.account}". Run: npm run cli -- config check`,
        );
        process.exitCode = 1;
        return;
      }

      let sessionDate: string;
      try {
        sessionDate = assertIsoDate(opts.date);
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let start: string;
      let end: string;
      try {
        ({ start, end } = resolveBookOneStartEnd(cfg, opts.start, opts.end));
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      let courtLabel: string;
      try {
        courtLabel = resolveCourtForBookOne(opts.court).courtLabel;
      } catch (e) {
        console.error("tennis-booking:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
        return;
      }

      const job: PlannedJob = {
        sequence: 1,
        accountId: account.id,
        courtLabel,
        start,
        end,
        sessionDate,
      };

      console.error(
        `read-pin: venue ${venue.slug} — ${account.label} (${account.username}) / ${courtLabel} ${start}-${end} on ${sessionDate} (stderr: scrape logs; stdout: PIN only if found)`,
      );

      const browser = await chromium.launch({ headless: opts.headless });
      try {
        const pin = await readGatePinFromManageBookings(browser, venue, account, job);
        if (pin) {
          console.log(pin);
        } else {
          console.error("read-pin: no PIN matched — check My bookings row matches date, start time, and court");
          process.exitCode = 1;
        }
      } catch (e) {
        console.error("tennis-booking: read-pin failed:", e instanceof Error ? e.message : e);
        process.exitCode = 1;
      } finally {
        await browser.close();
      }
    },
  );

program.showHelpAfterError();
program.parse();
