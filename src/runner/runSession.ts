import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser } from "playwright";
import { loadConfig, type ConfigAccount, type LoadedConfig } from "../loadConfig.js";
import { planJobs } from "../planner/planJobs.js";
import type { PlannedJob } from "../planner/types.js";
import { login } from "../adapters/clubspark/auth.js";
import {
  bookJobThroughBasket,
  clickConfirmAndPay,
  clickSlotForPlannedJob,
  completeBookingDurationOverlay,
  gotoBookingForSession,
  pickSessionDateInCalendar,
  proceedThroughTermsToBasket,
  tryDismissCookieConsent,
} from "../adapters/clubspark/bookSlot.js";
import { payWithCard, type CardPaymentInput } from "../adapters/clubspark/pay.js";
import { readGatePinForJob } from "../adapters/clubspark/confirmation.js";
import { LedgerStore } from "../ledger/store.js";
import { buildMondayThreeCourtTemplate } from "../mondayPlan.js";

export type RunSessionOptions = {
  configPath: string;
  sessionDate: string;
  headless: boolean;
  card: CardPaymentInput;
};

/** Monday preset: same jobs as `planJobs(accounts, buildMondayThreeCourtTemplate(sessionDate))`. */
export function planMondayPresetJobs(cfg: LoadedConfig, sessionDate: string): PlannedJob[] {
  const template = buildMondayThreeCourtTemplate(sessionDate);
  return planJobs(cfg.accounts, template);
}

export type PlannedJobExecutor = (job: PlannedJob, account: ConfigAccount) => Promise<string | null>;

export type RunPlannedJobsWithLedgerOptions = {
  jobs: PlannedJob[];
  store: LedgerStore;
  getAccount: (accountId: string) => ConfigAccount;
  executeJob: PlannedJobExecutor;
  log?: (line: string) => void;
  /** When set, logs a PIN-free status summary at end of run for this session date. */
  sessionDate?: string;
  /**
   * When true, skips `upsertFromPlannedJobs` (caller already wrote rows — e.g. before browser launch).
   */
  skipUpsert?: boolean;
};

/**
 * Upserts planned jobs into the ledger (unless `skipUpsert`), runs each with `executeJob`, updates
 * row status/accessCode, then optionally logs markdown for a session date.
 */
export async function runPlannedJobsWithLedger(options: RunPlannedJobsWithLedgerOptions): Promise<void> {
  const { jobs, store, getAccount, executeJob, log, sessionDate, skipUpsert } = options;
  if (!skipUpsert) {
    store.upsertFromPlannedJobs(jobs);
  }
  for (const job of jobs) {
    let pin: string | null;
    try {
      const account = getAccount(job.accountId);
      log?.(
        `run: job ${job.sequence}/${jobs.length} ${job.courtLabel} ${job.start}-${job.end} as ${account.label} (${account.username})`,
      );
      pin = await executeJob(job, account);
    } catch (e) {
      try {
        store.updateRowForPlannedJob(job, { status: "failed" });
      } catch (ledgerErr) {
        const msg = ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr);
        log?.(`run: could not record failed status for job ${job.sequence}: ${msg}`);
      }
      throw e;
    }
    store.updateRowForPlannedJob(job, {
      accessCode: pin ?? undefined,
      status: pin ? "confirmed" : "pending_pin",
    });
    log?.(`run: job ${job.sequence} done${pin ? " (PIN received)" : " (no PIN on page)"}`);
  }
  log?.("run: all jobs finished.");
  if (sessionDate !== undefined) {
    const rows = store.getRows(sessionDate);
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    const parts = [...counts.entries()].map(([s, n]) => `${n} ${s}`);
    log?.(`run: summary — ${parts.join(", ")}`);
  }
}

function accountById(cfg: LoadedConfig, id: string): ConfigAccount {
  const a = cfg.accounts.find((x) => x.id === id);
  if (!a) throw new Error(`Config has no active account with id "${id}"`);
  return a;
}

async function runOneJob(
  browser: Browser,
  job: PlannedJob,
  account: ConfigAccount,
  card: CardPaymentInput | (() => Promise<CardPaymentInput>),
): Promise<string | null> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await gotoBookingForSession(page, job.sessionDate, { role: "guest" });
    await login(page, account.username, account.password);
    await gotoBookingForSession(page, job.sessionDate);
    await bookJobThroughBasket(page, job);
    await clickConfirmAndPay(page);
    const cardPayload =
      typeof card === "function" ? { ...(await card()) } : { ...card };
    await payWithCard(page, cardPayload);
    return readGatePinForJob(page, job);
  } finally {
    await context.close();
  }
}

/**
 * Plan Monday 19:30–22:00 for three courts, write ledger, then run each job (login → pay → PIN).
 * Stops on first error (browser closed after failure).
 */
export async function runBookingSession(opts: RunSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const jobs = planMondayPresetJobs(cfg, opts.sessionDate);
  const store = new LedgerStore(LedgerStore.defaultPath());
  store.upsertFromPlannedJobs(jobs);

  const browser = await chromium.launch({ headless: opts.headless });
  try {
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount: (id) => accountById(cfg, id),
      executeJob: (job, account) => runOneJob(browser, job, account, opts.card),
      log: (line) => console.error(line),
      sessionDate: opts.sessionDate,
      skipUpsert: true,
    });
  } finally {
    await browser.close();
  }
}

export type RunAdHocBookingSessionOptions = {
  configPath: string;
  jobs: PlannedJob[];
  headless: boolean;
  /** Called at most once, when the first job reaches payment (subsequent jobs reuse the same card). */
  getCardWhenNeeded: () => Promise<CardPaymentInput>;
};

/**
 * Run ad hoc planned jobs (already split to ≤2h); ledger + checkout per job. Card is read only when payment is reached.
 */
export async function runAdHocBookingSession(opts: RunAdHocBookingSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const store = new LedgerStore(LedgerStore.defaultPath());
  store.upsertFromPlannedJobs(opts.jobs);

  let cardCache: CardPaymentInput | undefined;
  const getCard = async () => {
    if (!cardCache) cardCache = await opts.getCardWhenNeeded();
    return cardCache;
  };

  const browser = await chromium.launch({ headless: opts.headless });
  try {
    await runPlannedJobsWithLedger({
      jobs: opts.jobs,
      store,
      getAccount: (id) => accountById(cfg, id),
      executeJob: (job, account) => runOneJob(browser, job, account, getCard),
      log: (line) => console.error(line),
      sessionDate: opts.jobs[0]?.sessionDate,
      skipUpsert: true,
    });
  } finally {
    await browser.close();
  }
}

export type DryRunBookOneSessionOptions = {
  configPath: string;
  jobs: PlannedJob[];
  headless: boolean;
};

/**
 * For each planned job: login → slot → duration → basket → pay CTA (no Stripe submit), same pattern as Monday `dry-run`.
 */
export async function dryRunBookOneSession(opts: DryRunBookOneSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const browser = await chromium.launch({ headless: opts.headless });
  try {
    for (const job of opts.jobs) {
      const account = accountById(cfg, job.accountId);
      console.error(
        `book-one dry-run: job ${job.sequence}/${opts.jobs.length} — ${account.label} (${account.username}) / ${job.courtLabel} ${job.start}-${job.end}`,
      );
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await gotoBookingForSession(page, job.sessionDate, { role: "guest" });
        await login(page, account.username, account.password);
        await gotoBookingForSession(page, job.sessionDate);
        await tryDismissCookieConsent(page);
        await pickSessionDateInCalendar(page, job.sessionDate);
        await clickSlotForPlannedJob(page, job);
        await completeBookingDurationOverlay(page, job);
        await proceedThroughTermsToBasket(page);
        await clickConfirmAndPay(page);
        console.error(
          `book-one dry-run: job ${job.sequence} reached checkout (payment not submitted). Inspect the browser.`,
        );
        if (opts.headless) {
          await page.waitForTimeout(15_000);
        } else {
          await page.pause();
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
