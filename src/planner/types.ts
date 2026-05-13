/** Account used for Clubspark login; planner only needs id + booking limits. */
export type BookingAccount = {
  id: string;
  label: string;
  /** Max Clubspark bookings per calendar day for this account (default 2). */
  maxBookingsPerDay?: number;
  /**
   * Max simultaneously-active bookings (i.e. confirmed/pending_pin/manual_override rows whose
   * `sessionDate >= today`) for this account at any time. Default 5 (Caber Park rule). Past
   * bookings drop out automatically as sessions play out, so this is a rolling cap, not a
   * calendar-month cap.
   */
  maxActiveBookings?: number;
  active?: boolean;
};

/** Local wall-clock range (same timezone as venue booking UI). */
export type TimeWindow = {
  start: string;
  /** `HH:mm` 24h */
  end: string;
};

/** One bookable block on a court; duration must be ≤ template.maxHoursPerBooking. */
export type TemplateSlot = {
  courtIndex: number;
  courtLabel: string;
  start: string;
  end: string;
};

/** How an ad hoc booking run should execute (runner uses this in later tasks). */
export type AdHocBookingMode = "real" | "dry-run";

/** Single-court ad hoc input; template builder turns [start,end] into one or more slots. */
export type AdHocBookingRequest = {
  sessionDate: string;
  courtIndex: number;
  courtLabel: string;
  start: string;
  end: string;
  mode: AdHocBookingMode;
  /** If set, planning may pin jobs to this account in a later task. */
  accountIdOverride?: string;
  /** Each generated slot is at most this many hours (default 2). */
  maxHoursPerBooking?: number;
};

/** Optional constraints for {@link planJobs}. */
export type PlanJobsOptions = {
  /** When set, planning uses only this account; fails if it cannot satisfy all slots. */
  accountId?: string;
  /** Minimum distinct courts required in template (default 3 for Monday sessions, 1 for ad-hoc). */
  minCourts?: number;
  /**
   * Pre-counted prior **active future** bookings per account: confirmed/pending_pin/
   * manual_override rows already on file whose `sessionDate >= today` and whose `sessionDate`
   * differs from the session currently being planned (so a re-plan doesn't double-count its
   * own rows). Together with each account's `maxActiveBookings` (default 5) this prevents
   * the planner from overshooting the venue's total active-booking cap. Missing keys are
   * treated as 0.
   */
  priorActiveBookings?: ReadonlyMap<string, number>;
};

/** Describes how Monday (or any) session is split into ≤2h Clubspark bookings. */
export type SessionTemplate = {
  /** ISO date `YYYY-MM-DD` for the session being booked. */
  sessionDate: string;
  /** Each slot becomes one PlannedJob after assignment. */
  slots: TemplateSlot[];
  /** Club rule: hours per single booking (default 2). */
  maxHoursPerBooking?: number;
};

/** One automated booking job (one checkout). */
export type PlannedJob = {
  sequence: number;
  accountId: string;
  courtLabel: string;
  start: string;
  end: string;
  sessionDate: string;
};
