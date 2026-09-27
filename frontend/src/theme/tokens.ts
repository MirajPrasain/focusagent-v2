// Design tokens: the one place for the app's colors and font. tailwind.config.js turns them into classes
// (bg-page, bg-surface, border-border, text-fg-secondary, bg-accent, ...). Import them directly only where a class
// can't reach, like chart SVG fills.
export const colors = {
  page: '#0b0f17',
  surface: '#111827',
  border: '#1f2937',
  fg: {
    DEFAULT: '#f3f4f6', // primary text
    secondary: '#9ca3af',
    muted: '#6b7280',
  },
  accent: '#3987e5', // also "focused"
  distracted: '#e66767',
  away: '#8b929c', // neutral gray: "Can't see you"
};

export const fontSans = [
  'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"',
  'Arial', 'sans-serif',
];
