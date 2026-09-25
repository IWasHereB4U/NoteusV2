export function KpiStrip({ items }) {
  return (
    <div className="kpis">
      {items.map((k) => (
        <div key={k.label} className={`kpi ${k.cls || ''}`}>
          <div className="lab">{k.label}</div>
          <div className="val">{k.value}</div>
        </div>
      ))}
    </div>
  );
}
