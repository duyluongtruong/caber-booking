type Props = {
  courts: readonly string[];
  selected: string | null;
  onSelect: (court: string | null) => void;
};

export function CourtChips({ courts, selected, onSelect }: Props) {
  if (courts.length <= 1) return null;
  const handle = (court: string | null) => {
    if (court !== null && court === selected) onSelect(null);
    else onSelect(court);
  };
  return (
    <div className="chips" role="group" aria-label="Filter by court">
      <button
        type="button"
        className="chip"
        aria-pressed={selected === null}
        onClick={() => handle(null)}
      >
        All
      </button>
      {courts.map((c) => (
        <button
          key={c}
          type="button"
          className="chip"
          aria-pressed={selected === c}
          onClick={() => handle(c)}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
