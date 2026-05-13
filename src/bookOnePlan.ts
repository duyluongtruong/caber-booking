import { buildAdHocSessionTemplate } from "./adHocTemplate.js";
import { DEFAULT_COURT_LABELS } from "./mondayPlan.js";
import { planJobs } from "./planner/planJobs.js";
import { timeToMinutes } from "./planner/time.js";
import type { PlannedJob } from "./planner/types.js";
import type { LoadedConfig } from "./loadConfig.js";
import { assertIsoDate } from "./sessionDate.js";

export type BookOnePlanInput = {
  sessionDate: string;
  courtArg?: string;
  start?: string;
  end?: string;
  accountId?: string;
  /** Prior active future bookings per account — enforces the venue's total active-booking cap. */
  priorActiveBookings?: ReadonlyMap<string, number>;
};

/**
 * Map CLI `--court` (number or label) to a venue grid column index and label.
 */
export function resolveCourtForBookOne(
  raw: string | undefined,
  labels: readonly string[] = DEFAULT_COURT_LABELS,
): { courtIndex: number; courtLabel: string } {
  const trimmed = raw?.trim() ?? "";
  const use = trimmed.length > 0 ? trimmed : "1";
  const digits = /^(\d+)$/.exec(use);
  if (digits) {
    const n = parseInt(digits[1], 10);
    if (n < 1 || n > labels.length) {
      throw new Error(`Court number must be 1–${labels.length}, got ${n}`);
    }
    const courtLabel = labels[n - 1]!;
    return { courtIndex: n - 1, courtLabel };
  }
  const lower = use.toLowerCase();
  const idx = labels.findIndex((l) => l.toLowerCase() === lower);
  if (idx >= 0) {
    return { courtIndex: idx, courtLabel: labels[idx]! };
  }
  throw new Error(
    `Unknown court "${use}". Use 1–${labels.length} or a label like "${labels[0] ?? "Court 1"}".`,
  );
}

/** Resolved wall-clock window after CLI flags and config defaults. */
export function resolveBookOneStartEnd(
  cfg: LoadedConfig,
  start?: string,
  end?: string,
): { start: string; end: string } {
  const s = start?.trim() || cfg.defaultSessionStart;
  const e = end?.trim() || cfg.defaultSessionEnd;
  if (!s || !e) {
    throw new Error(
      "book-one needs --start and --end (HH:mm), or defaultSessionStart and defaultSessionEnd in config",
    );
  }
  return { start: s, end: e };
}

/**
 * Plan checkout jobs for a single-court ad hoc window (≤2h chunks), using {@link planJobs} assignment rules.
 */
export function planBookOneJobs(cfg: LoadedConfig, input: BookOnePlanInput): PlannedJob[] {
  const sessionDate = assertIsoDate(input.sessionDate);
  const { courtIndex, courtLabel } = resolveCourtForBookOne(input.courtArg);
  const { start, end } = resolveBookOneStartEnd(cfg, input.start, input.end);

  const template = buildAdHocSessionTemplate({
    sessionDate,
    courtIndex,
    courtLabel,
    start,
    end,
    mode: "real",
  });

  const planOpts: Parameters<typeof planJobs>[2] = {};
  if (input.accountId !== undefined && input.accountId.length > 0) {
    planOpts.accountId = input.accountId;
  }
  if (input.priorActiveBookings !== undefined) {
    planOpts.priorActiveBookings = input.priorActiveBookings;
  }

  return planJobs(cfg.accounts, template, Object.keys(planOpts).length > 0 ? planOpts : undefined);
}

/** True when the requested wall-clock span is strictly longer than two hours (split visibility). */
export function bookOneRequestedSpanExceedsTwoHours(start: string, end: string): boolean {
  return timeToMinutes(end) - timeToMinutes(start) > 120;
}
