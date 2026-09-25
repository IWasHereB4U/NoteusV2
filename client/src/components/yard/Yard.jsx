import { useEffect, useRef, useState } from 'react';
import { useYard, ANIMATIONS } from '../../context/YardContext.jsx';
import { ChibiSprite, AnimLabel } from './ChibiSprite.jsx';
import { AnimationWheel } from './AnimationWheel.jsx';

const STRIP_WIDTH = 1400; // idle-walk bounds; the strip itself scrolls if narrower
const MARGIN = 20;

export function Yard() {
  const { chibis, moveSelf, playAnimation, waiting, selfId } = useYard();
  const [wheel, setWheel] = useState(null); // {x,y}
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const idleTimer = useRef(null);

  // Idle random walk for the local chibi: pick a new target every few
  // seconds and let the CSS transition glide it there, unless the player
  // is dragging it or it's mid-way into a duo handshake walk-up.
  useEffect(() => {
    if (!selfId) return;
    function tick() {
      if (!dragging && !chibis[selfId]?.duoPartnerId) {
        const target = MARGIN + Math.round(Math.random() * (STRIP_WIDTH - MARGIN * 2));
        moveSelf(target);
      }
      idleTimer.current = setTimeout(tick, 3000 + Math.random() * 2500);
    }
    idleTimer.current = setTimeout(tick, 1500);
    return () => clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfId, dragging]);

  function startDrag(e) {
    e.preventDefault();
    clearTimeout(idleTimer.current);
    setDragging(true);
    const stripRect = e.currentTarget.closest('.yard-strip').getBoundingClientRect();
    dragRef.current = { stripLeft: stripRect.left };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', endDrag);
  }
  function onDragMove(e) {
    if (!dragRef.current) return;
    const x = Math.max(MARGIN, e.clientX - dragRef.current.stripLeft - 20);
    moveSelf(x);
  }
  function endDrag() {
    dragRef.current = null;
    setDragging(false);
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', endDrag);
  }

  function openWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    setWheel({ x: e.clientX, y: e.clientY });
  }

  function pick(type) {
    setWheel(null);
    playAnimation(type);
  }

  return (
    <div className="yard-strip">
      <div className="yard-ground">
        {Object.values(chibis).map((c) => (
          <div
            key={c.userId}
            className="yard-chibi"
            style={{ left: c.x ?? 0, transition: c.self && dragging ? 'none' : 'left .9s ease-in-out' }}
            onMouseDown={c.self ? startDrag : undefined}
            onContextMenu={c.self ? openWheel : (e) => e.preventDefault()}
            title={c.self ? 'You — drag to move, right-click for actions' : c.name}
          >
            <ChibiSprite color={c.color} animation={c.animation} animKey={c.animKey} dragging={c.self && dragging} />
            <div className="yard-name">{c.self ? 'You' : c.name}</div>
            {c.animation && (
              <div className="yard-bubble"><AnimLabel type={c.animation} /></div>
            )}
          </div>
        ))}
        {waiting && (
          <div className="yard-waiting">
            Waiting for someone to {ANIMATIONS[waiting]?.label.toLowerCase()} back…
          </div>
        )}
      </div>

      {wheel && <AnimationWheel x={wheel.x} y={wheel.y} onPick={pick} onClose={() => setWheel(null)} />}
    </div>
  );
}
