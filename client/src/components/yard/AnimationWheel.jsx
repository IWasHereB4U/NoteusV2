import { ANIMATIONS } from '../../context/YardContext.jsx';

// Renders each animation as a pie wedge around the point the wheel was
// opened at. Purely positional trig — no canvas needed.
function wedgePath(index, total, radius, innerRadius) {
  const slice = (2 * Math.PI) / total;
  const start = index * slice - Math.PI / 2;
  const end = start + slice;
  const p = (r, a) => [radius + r * Math.cos(a), radius + r * Math.sin(a)];
  const [x1, y1] = p(radius, start);
  const [x2, y2] = p(radius, end);
  const [x3, y3] = p(innerRadius, end);
  const [x4, y4] = p(innerRadius, start);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 0 0 ${x4} ${y4} Z`;
}

export function AnimationWheel({ x, y, onPick, onClose }) {
  const types = Object.entries(ANIMATIONS);
  const R = 90;
  const IR = 34;

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60 }}
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <svg
        width={R * 2}
        height={R * 2}
        style={{ position: 'absolute', left: x - R, top: y - R, filter: 'drop-shadow(0 8px 20px rgba(11,22,21,.35))' }}
      >
        {types.map(([key, def], i) => {
          const slice = (2 * Math.PI) / types.length;
          const mid = i * slice - Math.PI / 2 + slice / 2;
          const labelR = (R + IR) / 2;
          const lx = R + labelR * Math.cos(mid);
          const ly = R + labelR * Math.sin(mid);
          return (
            <g
              key={key}
              onClick={(e) => { e.stopPropagation(); onPick(key); }}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={wedgePath(i, types.length, R, IR)}
                fill={def.duo ? 'var(--indigo)' : 'var(--teal)'}
                fillOpacity="0.92"
                stroke="var(--panel)"
                strokeWidth="2"
              />
              <text x={lx} y={ly - 2} textAnchor="middle" fontSize="18">{def.icon}</text>
              <text x={lx} y={ly + 14} textAnchor="middle" fontSize="9" fill="#fff" fontFamily="var(--mono)">
                {def.label}
              </text>
            </g>
          );
        })}
        <circle cx={R} cy={R} r={IR - 2} fill="var(--ink)" />
        <text x={R} y={R + 4} textAnchor="middle" fontSize="10" fill="#fff" fontFamily="var(--mono)">✕</text>
      </svg>
    </div>
  );
}
