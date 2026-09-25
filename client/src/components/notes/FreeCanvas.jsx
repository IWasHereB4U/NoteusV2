import { useEffect, useMemo, useRef, useState } from 'react';
import { CanvasBlock } from './CanvasBlock.jsx';
import { MediaLibrary } from './MediaLibrary.jsx';
import { mediaUrl } from '../../api/client.js';
import { stripHtml, countWords } from '../../utils/wordCount.js';

let nextId = 1;
const uid = () => `el${Date.now()}_${nextId++}`;

function TextBlock({ el, onEditHtml, readOnly }) {
  return (
    <div
      className="text-body"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => !readOnly && onEditHtml(e.currentTarget.innerHTML)}
      dangerouslySetInnerHTML={{ __html: el.html || (readOnly ? '' : 'Type something…') }}
    />
  );
}

function format(cmd, value) {
  document.execCommand(cmd, false, value);
}

export function FreeCanvas({ elements, onChange, mediaMap, onMediaMapNeedsRefresh, commentCounts, onElementComment, focusElementId, readOnly }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showMedia, setShowMedia] = useState(null); // 'image' | 'video' | null
  const blockRefs = useRef({});

  // Sums words across every text block on the canvas — images/videos don't
  // contribute — so the count reflects the whole note, not just whichever
  // block is selected.
  const wordCount = useMemo(
    () => elements
      .filter((el) => el.type === 'text')
      .reduce((sum, el) => sum + countWords(stripHtml(el.html)), 0),
    [elements]
  );

  useEffect(() => {
    if (!focusElementId) return;
    setSelectedId(focusElementId);
    blockRefs.current[focusElementId]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [focusElementId]);

  function update(id, patch) {
    onChange(elements.map((el) => (el.id === id ? { ...el, ...patch } : el)));
  }
  function remove(id) {
    onChange(elements.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function addText() {
    const el = { id: uid(), type: 'text', x: 60, y: 60, w: 240, h: 120, z: elements.length + 1, html: '' };
    onChange([...elements, el]);
    setSelectedId(el.id);
  }
  function addMedia(asset) {
    const el = {
      id: uid(),
      type: showMedia,
      x: 80,
      y: 80,
      w: 280,
      h: 200,
      z: elements.length + 1,
      mediaId: asset._id,
    };
    onChange([...elements, el]);
    onMediaMapNeedsRefresh?.(asset);
    setShowMedia(null);
    setSelectedId(el.id);
  }

  return (
    <div>
      <div className="canvas-toolbar">
        {!readOnly && (
          <>
            <button className="btn ghost sm" onClick={addText}>+ Text</button>
            <button className="btn ghost sm" onClick={() => setShowMedia('image')}>+ Image</button>
            <button className="btn ghost sm" onClick={() => setShowMedia('video')}>+ Video</button>
            {selectedId && elements.find((e) => e.id === selectedId)?.type === 'text' && (
              <>
                <span style={{ width: 1, background: 'var(--line2)' }} />
                <button className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); format('bold'); }}>B</button>
                <button className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); format('italic'); }}>I</button>
                <button className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); format('underline'); }}>U</button>
                <button className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); format('insertUnorderedList'); }}>• list</button>
                <button className="btn ghost sm" onMouseDown={(e) => { e.preventDefault(); format('foreColor', '#0E9C92'); }}>Color</button>
              </>
            )}
          </>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--ink3)', alignSelf: 'center' }}>
            {readOnly ? 'View only — you can still leave comments' : 'Drag the top bar to move · corner handle to resize'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--mono)', alignSelf: 'center' }}>
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        </span>
      </div>

      <div className="canvas-wrap" onMouseDown={() => setSelectedId(null)}>
        <div className="canvas-surface">
          {elements.map((el) => (
            <CanvasBlock
              key={el.id}
              el={el}
              selected={selectedId === el.id}
              onSelect={() => setSelectedId(el.id)}
              onChange={(patch) => update(el.id, patch)}
              onDelete={() => remove(el.id)}
              onComment={onElementComment ? () => onElementComment(el.id) : undefined}
              commentCount={commentCounts?.[el.id] || 0}
              readOnly={readOnly}
              ref={(node) => { blockRefs.current[el.id] = node; }}
            >
              {el.type === 'text' && (
                <TextBlock el={el} onEditHtml={(html) => update(el.id, { html })} readOnly={readOnly} />
              )}
              {el.type === 'image' && mediaMap[el.mediaId] && (
                <img src={mediaUrl(mediaMap[el.mediaId].url)} alt="" />
              )}
              {el.type === 'video' && mediaMap[el.mediaId] && (
                <video src={mediaUrl(mediaMap[el.mediaId].url)} controls />
              )}
            </CanvasBlock>
          ))}
        </div>
      </div>

      {showMedia && (
        <MediaLibrary onSelect={addMedia} onClose={() => setShowMedia(null)} />
      )}
    </div>
  );
}
