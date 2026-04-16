import type { SessionTemplate } from "./planner/types.js";
import { defaultThreeCourtMondaySlots } from "./planner/planJobs.js";

/** Labels as shown in Clubspark grid (adjust if venue strings differ). */
export const DEFAULT_COURT_LABELS = ["Court 1", "Court 2", "Court 3"] as const;

/**
 * Monday **evening** 19:30–22:00: three courts, 19:30–21:30 + 21:30–22:00 per court (≤2h per booking).
 */
export function buildMondayThreeCourtTemplate(sessionDate: string): SessionTemplate {
  return {
    sessionDate,
    ...defaultThreeCourtMondaySlots([...DEFAULT_COURT_LABELS]),
  };
}
