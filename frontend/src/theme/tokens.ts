// Design tokens: the one place for the app's colors and fonts. tailwind.config.js turns them into classes
// (bg-page, bg-surface, border-border, text-fg-secondary, bg-accent, font-mono, ...). Import them directly only
// where a class can't reach, like inline SVG fills.
export const colors = {
  page: '#08090c', // near-black ground
  surface: {
    DEFAULT: '#0c0e12', // cards, panels, camera frames
    raised: '#11141a', // notices, inputs, buttons on a surface
  },
  border: {
    DEFAULT: '#1c1f27',
    strong: '#262a34', // outlines that must read against a surface
    subtle: '#16181f', // header and footer rules
  },
  fg: {
    DEFAULT: '#f2f3f5', // primary text; also the primary button's fill
    secondary: '#a3a8b4',
    muted: '#767c89',
  },
  accent: '#8ab4ff', // also "focused"
  distracted: '#ff8a5b', // orange rather than red: tells apart from the blue by lightness and hue
  away: '#8b909c', // neutral gray: "Can't see you", "Not tracked"
};

// Loaded from Google Fonts in index.html
export const fontSans = ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"',
  'sans-serif'];
export const fontMono = ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'];
// Accent words in headlines only
export const fontSerif = ['"Instrument Serif"', 'Georgia', 'serif'];
