import { formatDateHeader, todayIso } from "../format.ts";

type Props = {
  date: string;
  onChange: (date: string) => void;
};

export function DateBar({ date, onChange }: Props) {
  const today = todayIso();
  return (
    <header className="date-bar">
      <div>
        <div className="label">{formatDateHeader(date)}</div>
        {date !== today && (
          <button
            type="button"
            className="today-link"
            onClick={() => onChange(today)}
            aria-label="Jump to today"
          >
            ← Today
          </button>
        )}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.currentTarget.value)}
        aria-label="Pick a date"
      />
    </header>
  );
}
