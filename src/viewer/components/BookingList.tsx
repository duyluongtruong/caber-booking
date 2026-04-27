import type { LedgerRow } from "../../ledger/types.ts";
import { groupByCourt } from "../selectors.ts";
import { CourtCard } from "./CourtCard.tsx";

type Props = { rows: readonly LedgerRow[] };

export function BookingList({ rows }: Props) {
  const groups = groupByCourt(rows);
  return (
    <section>
      {groups.map((g) => (
        <CourtCard key={g.courtLabel} courtLabel={g.courtLabel} rows={g.rows} />
      ))}
    </section>
  );
}
