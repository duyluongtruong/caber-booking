import type { LedgerRow } from "../../ledger/types.ts";
import { pinOrBadge } from "../format.ts";

type Props = { row: LedgerRow };

export function BookingRow({ row }: Props) {
  const view = pinOrBadge(row);
  return (
    <div className="row">
      <span className="time">{row.start} – {row.end}</span>
      {view.kind === "pin" ? (
        <span className="pin">
          {view.value}
          {view.edited && <span className="edited-mark" aria-label="manually entered">✎</span>}
        </span>
      ) : (
        <span className={`pill ${view.tone}`}>{view.label}</span>
      )}
    </div>
  );
}
