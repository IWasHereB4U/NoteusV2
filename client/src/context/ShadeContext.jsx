import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const ShadeContext = createContext(null);

const DEFAULT_ACCENT = { light: '#0E9C92', dark: '#3FD9CB' };

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function tint(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function ShadeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('noteus_shade_mode') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('noteus_shade_mode', mode);
  }, [mode]);

  const toggleMode = () => setMode((m) => (m === 'light' ? 'dark' : 'light'));

  return (
    <ShadeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ShadeContext.Provider>
  );
}

// Applies the signed-in person's chosen accent color as an inline CSS
// variable override on <html> — inline styles beat both the light and
// dark stylesheet defaults, so this one effect covers both shades.
// Rendered inside AuthProvider (needs useAuth) which is itself inside
// ShadeProvider (needs useShade) — see App.jsx.
export function AccentSync() {
  const { user } = useAuth();
  const { mode } = useShade();

  useEffect(() => {
    const root = document.documentElement;
    if (!user?.color) {
      root.style.removeProperty('--teal');
      root.style.removeProperty('--teal-t');
      return;
    }
    root.style.setProperty('--teal', user.color);
    const tintValue = tint(user.color, mode === 'dark' ? 0.22 : 0.14);
    if (tintValue) root.style.setProperty('--teal-t', tintValue);
  }, [user?.color, mode]);

  return null;
}

export function useShade() {
  const ctx = useContext(ShadeContext);
  if (!ctx) throw new Error('useShade must be used within ShadeProvider');
  return ctx;
}

export const ACCENT_PRESETS = [
  '#0E9C92', '#F1614B', '#DB9A2F', '#5B6EE1', '#9B5DE5',
  '#E0568C', '#3A8DE0', '#4CAF6D', '#8A6D3B', '#556270',
];
export const DEFAULT_SHADE_ACCENT = DEFAULT_ACCENT;
