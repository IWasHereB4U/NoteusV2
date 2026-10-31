// Shared by the Note Tag page and the Point of Interest module, which
// categorises places with the same tags.

export const TAG_COLORS = ['#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5', '#1F9D6B', '#C0392B', '#8A8F8E'];

// Soft background for a colored chip: the tag color at ~15% opacity.
export function tint(hex) {
  return /^#[0-9a-f]{6}$/i.test(hex || '') ? `${hex}26` : 'var(--line)';
}

export function TagChip({ tag, selected, onClick, small }) {
  const color = tag?.color || '#8A8F8E';
  const style = selected || !onClick
    ? { background: tint(color), color, borderColor: 'transparent' }
    : undefined;
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`tag-chip ${onClick ? 'pick' : ''}`}
      style={{ ...style, ...(small ? { fontSize: 11, padding: '2px 8px' } : null) }}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
    >
      <span className="dot" style={{ background: color }} />
      {tag?.name || 'Unknown tag'}
    </Tag>
  );
}
