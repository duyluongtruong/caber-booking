import { timeToMinutes } from "./time.js";
import type {
  BookingAccount,
  PlannedJob,
  PlanJobsOptions,
  SessionTemplate,
  TemplateSlot,
} from "./types.js";

const DEFAULT_MAX_BOOKINGS = 2;
const DEFAULT_MAX_HOURS = 2;

function slotDurationHours(slot: TemplateSlot): number {
  const a = timeToMinutes(slot.start);
  const b = timeToMinutes(slot.end);
  if (b <= a) throw new Error(`Slot end must be after start: ${slot.courtLabel} ${slot.start}-${slot.end}`);
  return (b - a) / 60;
}

function overlaps(a: TemplateSlot, b: TemplateSlot): boolean {
  const as = timeToMinutes(a.start);
  const ae = timeToMinutes(a.end);
  const bs = timeToMinutes(b.start);
  const be = timeToMinutes(b.end);
  return as < be && bs < ae;
}

/**
 * Assign each template slot to an account: ≤ `maxBookingsPerDay` jobs per account,
 * no time-overlapping slots on the same account, each slot duration ≤ `maxHoursPerBooking`.
 * Deterministic: accounts sorted by `id`, slots sorted by start then courtIndex.
 */
export function planJobs(accounts: BookingAccount[], template: SessionTemplate, opts?: PlanJobsOptions): PlannedJob[] {
  const maxHours = template.maxHoursPerBooking ?? DEFAULT_MAX_HOURS;

  let active = accounts
    .filter((a) => a.active !== false)
    .sort((x, y) => x.id.localeCompare(y.id));

  if (opts?.accountId !== undefined) {
    if (opts.accountId === "") {
      throw new Error("accountId override must not be empty");
    }
    const match = active.find((a) => a.id === opts.accountId);
    if (!match) {
      const exists = accounts.some((a) => a.id === opts.accountId);
      throw new Error(
        exists
          ? `Account "${opts.accountId}" is not active`
          : `Unknown booking account id "${opts.accountId}"`,
      );
    }
    active = [match];
  }

  if (active.length === 0) throw new Error("No active accounts");

  const slots = [...template.slots].sort((s, t) => {
    const c = timeToMinutes(s.start) - timeToMinutes(t.start);
    return c !== 0 ? c : s.courtIndex - t.courtIndex;
  });

  for (const s of slots) {
    const h = slotDurationHours(s);
    if (h > maxHours + 1e-9) {
      throw new Error(
        `Slot ${s.courtLabel} ${s.start}-${s.end} is ${h}h; max ${maxHours}h per booking`,
      );
    }
  }

  if (opts?.minCourts !== undefined) {
    const courtLabels = new Set(slots.map((s) => s.courtLabel));
    if (courtLabels.size < opts.minCourts) {
      throw new Error(`Need at least ${opts.minCourts} distinct courts in template; got ${courtLabels.size}`);
    }
  }

  type Assigned = { slot: TemplateSlot; accountId: string };
  const assigned: Assigned[] = [];

  for (const slot of slots) {
    let picked: BookingAccount | undefined;
    for (const acc of active) {
      const cap = acc.maxBookingsPerDay ?? DEFAULT_MAX_BOOKINGS;
      const mine = assigned.filter((x) => x.accountId === acc.id);
      if (mine.length >= cap) continue;
      const slotForAcc = mine.map((x) => x.slot);
      if (slotForAcc.some((s) => overlaps(s, slot))) continue;
      picked = acc;
      break;
    }
    if (!picked) {
      throw new Error(
        opts?.accountId
          ? `Cannot assign all slots to account "${opts.accountId}"`
          : "Not enough account capacity or overlapping limits: cannot assign all slots",
      );
    }
    assigned.push({ slot, accountId: picked.id });
  }

  return assigned.map((a, i) => ({
    sequence: i + 1,
    accountId: a.accountId,
    courtLabel: a.slot.courtLabel,
    start: a.slot.start,
    end: a.slot.end,
    sessionDate: template.sessionDate,
  }));
}

/**
 * Default Caber Monday **evening** session: 3 courts, **19:30–21:30** (2h) + **21:30–22:00** each.
 * Times are **24-hour** (`19:30` = 7:30 PM). Older values `07:30` were 7:30 **AM**, not evening.
 */
export function defaultThreeCourtMondaySlots(
  courtLabels: [string, string, string],
): Omit<SessionTemplate, "sessionDate"> {
  const blocks: TemplateSlot[] = [];
  for (let i = 0; i < 3; i++) {
    blocks.push({
      courtIndex: i,
      courtLabel: courtLabels[i],
      start: "19:30",
      end: "21:30",
    });
    blocks.push({
      courtIndex: i,
      courtLabel: courtLabels[i],
      start: "21:30",
      end: "22:00",
    });
  }
  return { slots: blocks, maxHoursPerBooking: 2 };
}
