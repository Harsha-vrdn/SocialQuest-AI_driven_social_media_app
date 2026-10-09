// Match the website's dark palette in web/static/pixelquest.css.
// Use its darker violet for solid buttons so white labels stay readable.
export const colors = {
  background: '#050916',
  surface: '#0B1326',
  elevated: '#101C36',
  field: '#071022',
  border: '#263552',
  borderBright: '#536C9D',
  text: '#F8F5E8',
  muted: '#AEB7CC',
  accent: '#9A65FF',
  primary: '#6741C7',
  accentSoft: '#101C36',
  selection: '#3B286F',
  mint: '#9CEC4C', // Website lime: accepted, complete, and online.
  sky: '#4FE3EE', // Website cyan: navigation and secondary highlights.
  gold: '#FFD35D',
  rose: '#FF68B4',
  danger: '#FF7B73',
} as const;

// Light foregrounds on dark tinted surfaces keep small pixel text readable.
export const accents = {
  neutral: {text: colors.text, surface: colors.surface, border: colors.border},
  purple: {text: colors.accent, surface: colors.accentSoft, border: colors.primary},
  mint: {text: colors.mint, surface: colors.elevated, border: colors.borderBright},
  sky: {text: colors.sky, surface: colors.elevated, border: colors.borderBright},
  gold: {text: colors.gold, surface: colors.elevated, border: colors.borderBright},
  rose: {text: colors.rose, surface: colors.elevated, border: colors.borderBright},
  danger: {text: colors.danger, surface: colors.elevated, border: colors.borderBright},
} as const;
export type Accent = keyof typeof accents;

export const motion = {
  enter: 240,
  press: 100,
  release: 180,
} as const;

export const fonts = {
  // Departure Mono has one weight. Keep semantic roles without synthesizing bold.
  heading: 'DepartureMono',
  copy: 'DepartureMono',
  bold: 'DepartureMono',
} as const;
