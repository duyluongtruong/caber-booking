/** Account used for Clubspark login; planner only needs id + booking limits. */
export type BookingAccount = {
  id: string;
  label: string;
  /** Max Clubspark bookings per calendar day for this account (default 2). */
  maxBookingsPerDay?: number;
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
