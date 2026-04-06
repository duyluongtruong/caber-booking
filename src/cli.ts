#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { loadConfig, resolveConfigPath } from "./loadConfig.js";
import { login } from "./adapters/clubspark/auth.js";
import {
  clickSlotForPlannedJob,
  gotoBookingForSession,
  pickSessionDateInCalendar,
  proceedThroughTermsToBasket,
  tryDismissCookieConsent,
} from "./adapters/clubspark/bookSlot.js";
import { planJobs } from "./planner/planJobs.js";
import { buildMondayThreeCourtTemplate } from "./mondayPlan.js";
import { resolveSessionDate } from "./sessionDate.js";
import { runBookingSession } from "./runner/runSession.js";
import { readCardFromStdin } from "./prompts/readCard.js";

const program = new Command()
  .name("tennis-booking")
  .description("Local helper for multi-account Clubspark (Caber Park) booking");

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
  .option("--headless", "Run headless (default: headed)", false)
  .action(async (opts: { date?: string; weeks?: number; config?: string; headless: boolean }) => {
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

    console.error(`dry-run: session ${sessionDate} — ${jobs.length} planned job(s) (3 courts, Mon evening)`);
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
      await gotoBookingForSession(page, sessionDate);
      await login(page, account.username, account.password);
      await tryDismissCookieConsent(page);
      await pickSessionDateInCalendar(page, sessionDate);
      await clickSlotForPlannedJob(page, job);
      await proceedThroughTermsToBasket(page);

      console.error("dry-run: reached basket (before Confirm and pay). Inspect the browser window.");
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
  .option("--headless", "Run headless (default: headed)", false)
  .action(async (opts: { date?: string; weeks?: number; config?: string; headless: boolean }) => {
    const configPath = resolveCliConfigPath(opts.config);

    if (!existsSync(configPath)) {
      console.error(`tennis-booking: config file not found: ${configPath}`);
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

    console.error(`run: session ${sessionDate} — you will be prompted for card details (not logged).`);

    let card;
    try {
      card = await readCardFromStdin();
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
      });
    } catch (e) {
      console.error("tennis-booking: run failed:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program.showHelpAfterError();
program.parse();
