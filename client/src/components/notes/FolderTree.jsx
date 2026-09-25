export function FolderTree({ folders, currentId, unlockedIds, onSelect, parent = null, depth = 0 }) {
  const children = folders.filter((f) => String(f.parent || null) === String(parent));
  if (children.length === 0) return null;

  return (
    <div style={{ marginLeft: depth ? 12 : 0 }}>
      {children.map((f) => {
        const locked = f.locked && !unlockedIds.has(f._id);
        return (
          <div key={f._id}>
            <button
              onClick={() => onSelect(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                background: currentId === f._id ? 'var(--sunk)' : 'none', border: 0, borderRadius: 8,
                padding: '7px 9px', cursor: 'pointer', fontSize: 13.5, fontWeight: currentId === f._id ? 600 : 500,
                color: 'var(--ink)',
              }}
            >
              <span style={{ opacity: 0.6 }}>{locked ? '🔒' : '📁'}</span>
              {f.name}
            </button>
            <FolderTree
              folders={folders}
              currentId={currentId}
              unlockedIds={unlockedIds}
              onSelect={onSelect}
              parent={f._id}
              depth={depth + 1}
            />
          </div>
        );
      })}
    </div>
  );
}
