type Props = {
  title: string;
  hint?: string;
  onHintClick?: () => void;
  details?: string;
};

export function EmptyState({ title, hint, onHintClick, details }: Props) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      {hint && (
        <div className="small">
          {onHintClick ? (
            <button type="button" onClick={onHintClick}>{hint}</button>
          ) : (
            hint
          )}
        </div>
      )}
      {details && (
        <details style={{ marginTop: 12, textAlign: "left", fontSize: 12 }}>
          <summary>Details</summary>
          <pre style={{ whiteSpace: "pre-wrap", overflow: "auto" }}>{details}</pre>
        </details>
      )}
    </div>
  );
}
