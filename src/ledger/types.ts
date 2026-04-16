export type LedgerStatus = "not_started" | "pending_pin" | "confirmed" | "manual_override" | "failed";

/** One planned or completed booking row (court × time × account × optional gate PIN). */
export type LedgerRow = {
  sessionDate: string;
  courtLabel: string;
  start: string;
  end: string;
  accountId: string;
  jobSequence: number;
  accessCode?: string;
  status: LedgerStatus;
  bookingRef?: string;
};

/** On-disk shape: one array of rows per session date `YYYY-MM-DD`. */
export type LedgerFile = {
  sessions: Record<string, LedgerRow[]>;
};
