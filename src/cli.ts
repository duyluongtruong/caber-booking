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
import type { PlannedJob } from "./planner/types.js";

const program = new Command()
  .name("tennis-booking")
  .description("Local helper for multi-account Clubspark (Caber Park) booking");

const configCmd = new Command("config").description("Account JSON on disk");

configCmd
  .command("check")
  .description("Validate accounts file; print label, id, and username only (never passwords)")
  .option("-c, --config <path>", "accounts JSON path (else TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .action((opts: { config?: string }) => {
    const configPath = opts.config
      ? path.isAbsolute(opts.config)
        ? opts.config
        : path.resolve(process.cwd(), opts.config)
      : resolveConfigPath();

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
    "Open browser: sign in (first active account), pick date, add Court 1 (07:30–09:30) slot through basket — no payment",
  )
  .requiredOption("-d, --date <yyyy-mm-dd>", "Session date (ISO)")
  .option("-c, --config <path>", "accounts JSON (default: env TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .option("--headless", "Run headless (default: headed)", false)
  .action(async (opts: { date: string; config?: string; headless: boolean }) => {
    const configPath = opts.config
      ? path.isAbsolute(opts.config)
        ? opts.config
        : path.resolve(process.cwd(), opts.config)
      : resolveConfigPath();

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

    const account = cfg.accounts[0];
    if (!account) {
      console.error("tennis-booking: no active accounts in config");
      process.exitCode = 1;
      return;
    }

    const job: PlannedJob = {
      sequence: 1,
      accountId: account.id,
      courtLabel: "Court 1",
      start: "07:30",
      end: "09:30",
      sessionDate: opts.date,
    };

    console.error(`dry-run: account=${account.label} (${account.username}) date=${opts.date} (password not logged)`);

    const browser = await chromium.launch({ headless: opts.headless });
    const page = await browser.newPage();

    try {
      await gotoBookingForSession(page, opts.date);
      await login(page, account.username, account.password);
      await tryDismissCookieConsent(page);
      await pickSessionDateInCalendar(page, opts.date);
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

program.showHelpAfterError();
program.parse();
