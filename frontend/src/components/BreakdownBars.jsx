export default function BreakdownBars({ breakdown, risk }) {
  const rows = breakdown ?? [];

  return (
    <div className="breakdown">
      <div className="breakdown-head">
        <span className="eyebrow">Score breakdown</span>
        <span className="breakdown-total">
          {risk}
          <span className="muted"> / 100</span>
        </span>
      </div>
      {rows.length === 0 && <p className="muted">No breakdown available.</p>}
      <ul>
        {rows.map((row) => {
          const percent =
            row.weight > 0 ? (row.contribution / row.weight) * 100 : 0;
          return (
            <li key={row.feature} title={row.note ?? undefined}>
              <div className="row-head">
                <span>
                  {row.feature}
                  {row.note ? (
                    <em className="note-dot" title={row.note}>
                      *
                    </em>
                  ) : null}
                </span>
                <span className="row-points">
                  {Number(row.contribution).toFixed(1)}
                  <span className="muted"> / {Number(row.weight).toFixed(0)}</span>
                </span>
              </div>
              <div className="bar">
                <span
                  style={{
                    width: `${Math.max(2, Math.min(100, percent))}%`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
