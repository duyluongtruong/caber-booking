import { chromium, type Browser } from "playwright";
import { loadConfig, type ConfigAccount, type LoadedConfig } from "../loadConfig.js";
import { planJobs } from "../planner/planJobs.js";
import type { PlannedJob } from "../planner/types.js";
import { login } from "../adapters/clubspark/auth.js";
import {
  clickConfirmAndPay,
  clickSlotForPlannedJob,
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

function accountById(cfg: LoadedConfig, id: string): ConfigAccount {
  const a = cfg.accounts.find((x) => x.id === id);
  if (!a) throw new Error(`Config has no active account with id "${id}"`);
  return a;
}

async function runOneJob(
  browser: Browser,
  job: PlannedJob,
  account: ConfigAccount,
  card: CardPaymentInput,
): Promise<string | null> {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await gotoBookingForSession(page, job.sessionDate);
    await login(page, account.username, account.password);
    await tryDismissCookieConsent(page);
    await pickSessionDateInCalendar(page, job.sessionDate);
    await clickSlotForPlannedJob(page, job);
    await proceedThroughTermsToBasket(page);
    await clickConfirmAndPay(page);
    const cardCopy = { ...card };
    await payWithCard(page, cardCopy);
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
  const template = buildMondayThreeCourtTemplate(opts.sessionDate);
  const jobs = planJobs(cfg.accounts, template);

  const store = new LedgerStore(LedgerStore.defaultPath());
  store.upsertFromPlannedJobs(jobs);

  const browser = await chromium.launch({ headless: opts.headless });
  try {
    for (const job of jobs) {
      const account = accountById(cfg, job.accountId);
      console.error(
        `run: job ${job.sequence}/${jobs.length} ${job.courtLabel} ${job.start}-${job.end} as ${account.label} (${account.username})`,
      );
      try {
        const pin = await runOneJob(browser, job, account, opts.card);
        store.updateRow(job.sessionDate, job.sequence, {
          accessCode: pin ?? undefined,
          status: pin ? "confirmed" : "pending_pin",
        });
        console.error(`run: job ${job.sequence} done${pin ? ` PIN=${pin}` : " (no PIN on page)"}`);
      } catch (e) {
        store.updateRow(job.sessionDate, job.sequence, { status: "failed" });
        throw e;
      }
    }
    console.error("run: all jobs finished.");
    console.error(store.exportMarkdown(opts.sessionDate));
  } finally {
    await browser.close();
  }
}
