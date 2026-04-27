import type { LedgerRow } from "../../ledger/types.ts";
import { BookingRow } from "./BookingRow.tsx";

type Props = { courtLabel: string; rows: readonly LedgerRow[] };

export function CourtCard({ courtLabel, rows }: Props) {
  const headingId = `court-${courtLabel.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <article className="court-card" aria-labelledby={headingId}>
      <h2 id={headingId}>{courtLabel}</h2>
      {rows.map((r) => (
        <BookingRow
          key={`${r.sessionDate}-${r.courtLabel}-${r.start}-${r.jobSequence}`}
          row={r}
        />
      ))}
    </article>
  );
}
