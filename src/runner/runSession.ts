import { createInterface } from "node:readline";
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
  type ConfirmSlotShift,
  gotoBookingForSession,
  pickSessionDateInCalendar,
  proceedThroughTermsToBasket,
  SlotSkippedByOperator,
  SlotUnavailable,
  tryDismissCookieConsent,
  wallTimeToMinutesSinceMidnight,
} from "../adapters/clubspark/bookSlot.js";
import { readGatePinFromManageBookings } from "../adapters/clubspark/manageBookingsPin.js";
import { payWithCard, type CardPaymentInput } from "../adapters/clubspark/pay.js";
import type { VenueContext } from "../adapters/clubspark/selectors.js";
import { LedgerStore } from "../ledger/store.js";
import { buildMondayThreeCourtTemplate } from "../mondayPlan.js";

/**
 * Interactive stdin prompt for slot-shift confirmation.
 * Prints the question to stderr and waits for operator to type y/n.
 */
export async function stdinConfirmSlotShift(
  courtLabel: string,
  occupiedStart: string,
  proposedStart: string,
  end: string,
): Promise<boolean> {
  const remainingMins = wallTimeToMinutesSinceMidnight(end) - wallTimeToMinutesSinceMidnight(proposedStart);
  const h = Math.floor(remainingMins / 60);
  const m = remainingMins % 60;
  const durationLabel = m === 0 ? `${h}h` : h === 0 ? `${m}m` : `${h}h${m}m`;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(
      `\n⚠️  ${courtLabel} at ${occupiedStart} is occupied.\n   Shift start to ${proposedStart} (end stays ${end}, booking will be ${durationLabel} / ${remainingMins} min)? [y/N] `,
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      },
    );
  });
}

export type RunSessionOptions = {
  configPath: string;
  sessionDate: string;
  headless: boolean;
  card: CardPaymentInput;
  /** Per-run venue override (e.g. from CLI `--venue`). Defaults to `cfg.venue`. */
  venue?: VenueContext;
};

/**
 * Monday preset: same jobs as `planJobs(accounts, buildMondayThreeCourtTemplate(sessionDate))`.
 * When `priorActiveBookings` is provided it is forwarded to the planner so the venue's total
 * active-booking cap is enforced. Pass the result of
 * {@link LedgerStore.countActiveBookingsByAccount} with `excludeSessionDate: sessionDate` so
 * a re-plan for the same date doesn't double-count its own rows.
 */
export function planMondayPresetJobs(
  cfg: LoadedConfig,
  sessionDate: string,
  priorActiveBookings?: ReadonlyMap<string, number>,
): PlannedJob[] {
  const template = buildMondayThreeCourtTemplate(sessionDate);
  return planJobs(cfg.accounts, template, priorActiveBookings ? { priorActiveBookings } : undefined);
}

/**
 * Today as `YYYY-MM-DD` in the venue's timezone (Australia/Sydney). Uses `en-CA` because that
 * locale already formats dates as `YYYY-MM-DD`. Used by the runner to query the ledger for
 * active-future bookings (sessionDate >= today).
 */
export function todayAtVenueISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(now);
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
      const msg = e instanceof Error ? e.message : String(e);
      // SlotSkippedByOperator: operator declined the shift — mark failed and continue.
      // Any other error: mark failed and rethrow (fatal).
      try {
        store.updateRowForPlannedJob(job, { status: "failed" });
      } catch (ledgerErr) {
        const ledgerMsg = ledgerErr instanceof Error ? ledgerErr.message : String(ledgerErr);
        log?.(`run: could not record failed status for job ${job.sequence}: ${ledgerMsg}`);
      }
      if (e instanceof SlotSkippedByOperator) {
        log?.(`run: job ${job.sequence} skipped by operator — ${msg}`);
        continue;
      }
      if (e instanceof SlotUnavailable) {
        log?.(`run: job ${job.sequence} skipped — slot unavailable: ${msg}`);
        continue;
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
  ctx: VenueContext,
  job: PlannedJob,
  account: ConfigAccount,
  card: CardPaymentInput | (() => Promise<CardPaymentInput>),
  confirmShift?: ConfirmSlotShift,
): Promise<string | null> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await gotoBookingForSession(page, ctx, job.sessionDate, { role: "guest" });
    await login(page, account.username, account.password);
    await gotoBookingForSession(page, ctx, job.sessionDate);
    await bookJobThroughBasket(page, job, confirmShift);
    await clickConfirmAndPay(page);
    const cardPayload =
      typeof card === "function" ? { ...(await card()) } : { ...card };
    await payWithCard(page, ctx, cardPayload);

    // If the account has a known stable gate PIN configured, use it directly. Caber Park
    // (and most Clubspark venues) issue a per-account PIN that does not change per booking,
    // so the second-context login + Manage bookings navigation is pure overhead. Fall back
    // to scraping only when no accessCode is configured for this account.
    if (account.accessCode !== undefined) {
      console.error(
        `pin: using configured accessCode for ${account.label} (${account.username}) — skipping Manage bookings scrape`,
      );
      return account.accessCode;
    }
    console.error(
      `pin: payment complete — fetching gate PIN from Manage bookings (${ctx.manageBookings})`,
    );
    return readGatePinFromManageBookings(browser, ctx, account, job);
  } finally {
    await context.close();
  }
}

/**
 * Plan Monday session for three courts, write ledger, then run each job (login → pay → PIN).
 * If a slot is occupied the operator is prompted to shift start +30 min (keeping same end, ≥ 2h).
 * Operator-skipped jobs are marked failed and remaining jobs continue.
 */
export async function runBookingSession(opts: RunSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const ctx = opts.venue ?? cfg.venue;
  const store = new LedgerStore(LedgerStore.defaultPath());
  const today = todayAtVenueISO();
  const priorActive = store.countActiveBookingsByAccount({
    today,
    excludeSessionDate: opts.sessionDate,
  });
  const jobs = planMondayPresetJobs(cfg, opts.sessionDate, priorActive);
  if (priorActive.size > 0) {
    const parts = [...priorActive.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, n]) => `${id}=${n}`);
    console.error(`plan: prior active bookings by account (sessionDate >= ${today}, excluding ${opts.sessionDate}) — ${parts.join(", ")}`);
  }
  store.upsertFromPlannedJobs(jobs);

  const browser = await chromium.launch({ headless: opts.headless });
  try {
    await runPlannedJobsWithLedger({
      jobs,
      store,
      getAccount: (id) => accountById(cfg, id),
      executeJob: (job, account) => runOneJob(browser, ctx, job, account, opts.card, stdinConfirmSlotShift),
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
  /** Per-run venue override (e.g. from CLI `--venue`). Defaults to `cfg.venue`. */
  venue?: VenueContext;
};

/**
 * Run ad hoc planned jobs (already split to ≤2h); ledger + checkout per job. Card is read only when payment is reached.
 */
export async function runAdHocBookingSession(opts: RunAdHocBookingSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const ctx = opts.venue ?? cfg.venue;
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
      executeJob: (job, account) => runOneJob(browser, ctx, job, account, getCard, stdinConfirmSlotShift),
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
  /** Per-run venue override (e.g. from CLI `--venue`). Defaults to `cfg.venue`. */
  venue?: VenueContext;
};

/**
 * For each planned job: login → slot → duration → basket → pay CTA (no Stripe submit), same pattern as Monday `dry-run`.
 * Occupied slots trigger the operator shift prompt; skipped jobs are logged and the run continues.
 */
export async function dryRunBookOneSession(opts: DryRunBookOneSessionOptions): Promise<void> {
  const cfg = loadConfig(opts.configPath);
  const ctx = opts.venue ?? cfg.venue;
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
        await gotoBookingForSession(page, ctx, job.sessionDate, { role: "guest" });
        await login(page, account.username, account.password);
        await gotoBookingForSession(page, ctx, job.sessionDate);
        await tryDismissCookieConsent(page);
        await pickSessionDateInCalendar(page, job.sessionDate);
        const { start: actualStart } = await clickSlotForPlannedJob(page, job, undefined, stdinConfirmSlotShift);
        const effectiveJob = actualStart !== job.start ? { ...job, start: actualStart } : job;
        await completeBookingDurationOverlay(page, effectiveJob);
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
      } catch (e) {
        if (e instanceof SlotSkippedByOperator) {
          console.error(`book-one dry-run: job ${job.sequence} skipped by operator — ${e.message}`);
        } else if (e instanceof SlotUnavailable) {
          console.error(`book-one dry-run: job ${job.sequence} skipped — slot unavailable: ${e.message}`);
        } else {
          throw e;
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
