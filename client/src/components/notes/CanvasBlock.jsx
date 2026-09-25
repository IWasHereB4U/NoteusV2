import { forwardRef, useRef } from 'react';

// A single positioned element (text/image/video) on the free canvas.
// Drag moves it, the bottom-right handle resizes it. Both act on the
// element's own x/y/w/h via onChange, clamped to a sane minimum size.
export const CanvasBlock = forwardRef(function CanvasBlock(
  { el, selected, onSelect, onChange, onDelete, onComment, commentCount, readOnly, children },
  ref
) {
  const dragState = useRef(null);

  function startDrag(e) {
    if (readOnly) return;
    e.stopPropagation();
    onSelect();
    dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, x: el.x, y: el.y };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
  }

  function startResize(e) {
    if (readOnly) return;
    e.stopPropagation();
    onSelect();
    dragState.current = { mode: 'resize', startX: e.clientX, startY: e.clientY, w: el.w, h: el.h };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
  }

  function onMove(e) {
    const d = dragState.current;
    if (!d) return;
    if (d.mode === 'move') {
      onChange({ x: d.x + (e.clientX - d.startX), y: d.y + (e.clientY - d.startY) });
    } else {
      onChange({
        w: Math.max(60, d.w + (e.clientX - d.startX)),
        h: Math.max(40, d.h + (e.clientY - d.startY)),
      });
    }
  }

  function stop() {
    dragState.current = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', stop);
  }

  return (
    <div
      ref={ref}
      className={`canvas-el ${selected ? 'selected' : ''}`}
      style={{ left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z || 1 }}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="drag-bar" onMouseDown={startDrag}>
        <span>{el.type}</span>
        {onComment && (
          <button
            className={`comment-btn ${commentCount > 0 ? 'has-comments' : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onComment}
            title="Comment on this element"
          >
            💬{commentCount > 0 ? commentCount : ''}
          </button>
        )}
        {!readOnly && <button className="del" onMouseDown={(e) => e.stopPropagation()} onClick={onDelete}>remove</button>}
      </div>
      {children}
      {!readOnly && <div className="handle" onMouseDown={startResize} />}
    </div>
  );
});
