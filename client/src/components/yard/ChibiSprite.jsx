import { ANIMATIONS } from '../../context/YardContext.jsx';

// A small stylized figure built from primitives (no external art assets).
// `animKey` changes on every play so the CSS animation restarts even when
// the same animation type is played twice in a row.
export function ChibiSprite({ color = '#0E9C92', animation, animKey, dragging }) {
  return (
    <svg width="40" height="56" viewBox="0 0 40 56" style={{ overflow: 'visible', pointerEvents: 'none' }}>
      <ellipse cx="20" cy="50" rx="10" ry="3" fill="rgba(11,22,21,.15)" />
      <g key={animKey || 'idle'} className={`chibi-fig ${dragging ? '' : `anim-${animation || 'idle'}`}`}>
        <rect className="chibi-leg chibi-leg-l" x="14" y="36" width="4" height="12" rx="2" fill="var(--ink)" opacity=".55" />
        <rect className="chibi-leg chibi-leg-r" x="22" y="36" width="4" height="12" rx="2" fill="var(--ink)" opacity=".55" />
        <g className="chibi-body-group">
          <rect x="9" y="20" width="22" height="20" rx="10" fill={color} />
          <rect className="chibi-arm chibi-arm-l" x="4" y="22" width="6" height="16" rx="3" fill={color} style={{ transformOrigin: '7px 24px' }} />
          <rect className="chibi-arm chibi-arm-r" x="30" y="22" width="6" height="16" rx="3" fill={color} style={{ transformOrigin: '33px 24px' }} />
          <circle cx="20" cy="12" r="11" fill={color} />
          <circle cx="16" cy="11" r="1.6" fill="var(--ink)" />
          <circle cx="24" cy="11" r="1.6" fill="var(--ink)" />
        </g>
      </g>
    </svg>
  );
}

export function AnimLabel({ type }) {
  const def = ANIMATIONS[type];
  if (!def) return null;
  return <span>{def.icon} {def.label}</span>;
}
