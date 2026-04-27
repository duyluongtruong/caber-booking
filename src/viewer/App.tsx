import { useEffect, useState } from "react";
import type { LedgerFile } from "../ledger/types.ts";
import { fetchLedger, LedgerLoadError } from "./ledger.ts";
import {
  distinctCourts,
  filterByCourt,
  rowsForDate,
  sortRowsForDisplay,
} from "./selectors.ts";
import { formatDateHeader, todayIso } from "./format.ts";
import { DateBar } from "./components/DateBar.tsx";
import { CourtChips } from "./components/CourtChips.tsx";
import { BookingList } from "./components/BookingList.tsx";
import { EmptyState } from "./components/EmptyState.tsx";

export function App() {
  const [file, setFile]   = useState<LedgerFile | null>(null);
  const [error, setError] = useState<LedgerLoadError | null>(null);
  const [date, setDate]   = useState<string>(todayIso());
  const [court, setCourt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLedger().then(
      (f) => { if (!cancelled) setFile(f); },
      (e) => { if (!cancelled) setError(e instanceof LedgerLoadError ? e : new LedgerLoadError("network", String(e))); },
    );
    return () => { cancelled = true; };
  }, []);

  const todayRows = rowsForDate(file, date);
  const courts    = distinctCourts(todayRows);
  const visible   = sortRowsForDisplay(filterByCourt(todayRows, court));

  useEffect(() => {
    if (court !== null && !courts.includes(court)) setCourt(null);
  }, [court, courts]);

  if (error) {
    return (
      <>
        <DateBar date={date} onChange={setDate} />
        {renderError(error)}
      </>
    );
  }

  if (file === null) {
    return (
      <>
        <DateBar date={date} onChange={setDate} />
        <div className="skeleton" aria-busy="true">
          <div className="bar" style={{ width: "40%" }} />
          <div className="bar" style={{ width: "85%" }} />
          <div className="bar" style={{ width: "85%" }} />
          <div className="bar" style={{ width: "85%" }} />
        </div>
      </>
    );
  }

  return (
    <>
      <DateBar date={date} onChange={setDate} />
      <CourtChips courts={courts} selected={court} onSelect={setCourt} />
      {visible.length === 0 ? (
        <EmptyState
          title={`No bookings on ${formatDateHeader(date)}`}
          hint={date !== todayIso() ? "← Today" : undefined}
          onHintClick={date !== todayIso() ? () => setDate(todayIso()) : undefined}
        />
      ) : (
        <BookingList rows={visible} />
      )}
    </>
  );
}

function renderError(err: LedgerLoadError) {
  if (err.kind === "missing") {
    return <EmptyState title="No ledger yet — run a booking and push." />;
  }
  if (err.kind === "parse" || err.kind === "shape") {
    return <EmptyState title="Ledger file is corrupt." details={err.message} />;
  }
  return (
    <EmptyState
      title="Couldn't load bookings."
      hint="Check your connection and reload."
      details={err.message}
    />
  );
}
