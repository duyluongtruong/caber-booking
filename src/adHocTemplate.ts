import { minutesToHHmm, timeToMinutes } from "./planner/time.js";
import type { AdHocBookingRequest, SessionTemplate, TemplateSlot } from "./planner/types.js";

const DEFAULT_MAX_HOURS = 2;

/**
 * Build a {@link SessionTemplate} for one court from wall-clock start/end.
 * Duration ≤ `maxHoursPerBooking` → one slot; longer → contiguous chunks each ≤ that cap.
 */
export function buildAdHocSessionTemplate(req: AdHocBookingRequest): SessionTemplate {
  const maxHours = req.maxHoursPerBooking ?? DEFAULT_MAX_HOURS;
  if (maxHours <= 0) throw new Error("maxHoursPerBooking must be positive");

  const startM = timeToMinutes(req.start);
  const endM = timeToMinutes(req.end);
  if (endM <= startM) {
    throw new Error(`Ad hoc end must be after start: ${req.start}-${req.end}`);
  }

  const maxChunkMinutes = maxHours * 60;
  const slots: TemplateSlot[] = [];
  let cur = startM;
  while (cur < endM) {
    const next = Math.min(cur + maxChunkMinutes, endM);
    slots.push({
      courtIndex: req.courtIndex,
      courtLabel: req.courtLabel,
      start: minutesToHHmm(cur),
      end: minutesToHHmm(next),
    });
    cur = next;
  }

  return {
    sessionDate: req.sessionDate,
    slots,
    maxHoursPerBooking: maxHours,
  };
}
