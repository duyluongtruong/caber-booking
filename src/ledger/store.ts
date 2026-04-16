import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { PlannedJob } from "../planner/types.js";
import type { LedgerFile, LedgerRow } from "./types.js";

function sameCourtTimeWindow(row: LedgerRow, job: PlannedJob): boolean {
  return row.courtLabel === job.courtLabel && row.start === job.start && row.end === job.end;
}

export function resolveLedgerPath(): string {
  const fromEnv = process.env.TENNIS_BOOKING_LEDGER;
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "data", "ledger.json");
}

function emptyRoot(): LedgerFile {
  return { sessions: {} };
}

function readRoot(filePath: string): LedgerFile {
  if (!existsSync(filePath)) return emptyRoot();
  const raw = readFileSync(filePath, "utf8");
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("ledger root must be an object");
    }
    const sessions = (parsed as LedgerFile).sessions;
    if (sessions === undefined || typeof sessions !== "object" || Array.isArray(sessions)) {
      throw new Error('ledger must have object "sessions"');
    }
    return { sessions: sessions as Record<string, LedgerRow[]> };
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`Invalid JSON in ledger file ${filePath}`);
    throw e;
  }
}

function writeRoot(filePath: string, root: LedgerFile): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(root, null, 2)}\n`, "utf8");
}

export type LedgerRowPatch = Partial<Pick<LedgerRow, "accessCode" | "status" | "bookingRef">>;

export class LedgerStore {
  constructor(private readonly filePath: string) {}

  /** Default ledger file under `data/ledger.json` or `TENNIS_BOOKING_LEDGER`. */
  static defaultPath(): string {
    return resolveLedgerPath();
  }

  private read(): LedgerFile {
    return readRoot(this.filePath);
  }

  private write(root: LedgerFile): void {
    writeRoot(this.filePath, root);
  }

  /** All rows for a session date, sorted by `jobSequence`. */
  getRows(sessionDate: string): LedgerRow[] {
    const rows = this.read().sessions[sessionDate];
    if (!rows) return [];
    return [...rows].sort((a, b) => a.jobSequence - b.jobSequence);
  }

  /**
   * Merge jobs from the planner into existing rows for the session (keyed by court + time window).
   * Rows for other court/time slots on the same date are preserved. All jobs must share the same
   * `sessionDate`.
   */
  upsertFromPlannedJobs(jobs: PlannedJob[]): void {
    if (jobs.length === 0) return;
    const dates = new Set(jobs.map((j) => j.sessionDate));
    if (dates.size !== 1) {
      throw new Error("All PlannedJob entries must share the same sessionDate");
    }
    const sessionDate = jobs[0].sessionDate;
    const root = this.read();
    const existing = [...(root.sessions[sessionDate] ?? [])];
    const matched = new Set<number>();

    for (const job of jobs) {
      const idx = existing.findIndex((r, i) => !matched.has(i) && sameCourtTimeWindow(r, job));
      if (idx === -1) {
        existing.push({
          sessionDate: job.sessionDate,
          courtLabel: job.courtLabel,
          start: job.start,
          end: job.end,
          accountId: job.accountId,
          jobSequence: job.sequence,
          status: "not_started",
        });
        continue;
      }
      matched.add(idx);
      const row = existing[idx];
      row.sessionDate = job.sessionDate;
      row.courtLabel = job.courtLabel;
      row.start = job.start;
      row.end = job.end;
      row.jobSequence = job.sequence;
      if (row.accountId === job.accountId) {
        row.accountId = job.accountId;
      } else {
        row.accountId = job.accountId;
        row.status = "not_started";
        delete row.accessCode;
        delete row.bookingRef;
      }
    }

    root.sessions[sessionDate] = existing;
    this.write(root);
  }

  updateRow(sessionDate: string, jobSequence: number, patch: LedgerRowPatch): void {
    const root = this.read();
    const rows = root.sessions[sessionDate];
    if (!rows) throw new Error(`No ledger session for ${sessionDate}`);
    const row = rows.find((r) => r.jobSequence === jobSequence);
    if (!row) throw new Error(`No row with jobSequence ${jobSequence} for ${sessionDate}`);
    if (patch.accessCode !== undefined) row.accessCode = patch.accessCode;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.bookingRef !== undefined) row.bookingRef = patch.bookingRef;
    this.write(root);
  }

  /**
   * Patch the row for this job’s session date and court/time window. Prefer this from the runner when
   * `jobSequence` may repeat across separate upserts for the same date.
   */
  updateRowForPlannedJob(job: PlannedJob, patch: LedgerRowPatch): void {
    const root = this.read();
    const rows = root.sessions[job.sessionDate];
    if (!rows) throw new Error(`No ledger session for ${job.sessionDate}`);
    const row = rows.find((r) => sameCourtTimeWindow(r, job));
    if (!row) {
      throw new Error(
        `No ledger row for ${job.sessionDate} ${job.courtLabel} ${job.start}-${job.end}`,
      );
    }
    if (patch.accessCode !== undefined) row.accessCode = patch.accessCode;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.bookingRef !== undefined) row.bookingRef = patch.bookingRef;
    this.write(root);
  }

  /** Markdown table for sharing at the gate (includes PIN column when set). */
  exportMarkdown(sessionDate: string): string {
    const rows = this.getRows(sessionDate);
    const lines: string[] = [
      `# Session ${sessionDate}`,
      "",
      "| Court | Start | End | Account | PIN | Status |",
      "|-------|-------|-----|---------|-----|--------|",
    ];
    for (const r of rows) {
      const pin = r.accessCode ?? "";
      const esc = (s: string) => s.replace(/\|/g, "\\|");
      lines.push(
        `| ${esc(r.courtLabel)} | ${r.start} | ${r.end} | ${esc(r.accountId)} | ${esc(pin)} | ${r.status} |`,
      );
    }
    lines.push("");
    return lines.join("\n");
  }
}
