// A sunny, paper-like base with coral actions and purple navigation.
// Bright decorative fills have separate dark inks for readable labels.
const lightColors = {
  background: '#FFF7E9',
  surface: '#FFFDFA',
  elevated: '#F2E9DC',
  field: '#FFF9F0',
  border: '#DDC9CC',
  borderBright: '#927A85',
  text: '#2F2037',
  muted: '#6D5A70',
  accent: '#6231AF',
  primary: '#FA654D',
  onPrimary: '#2F2037',
  accentSoft: '#F0E4FF',
  selection: '#E6D8FF',
  mint: '#256343',
  mintSoft: '#DCF2C6',
  gold: '#765100',
  goldSoft: '#FFE69A',
  sky: '#225B83',
  skySoft: '#DCEFFD',
  rose: '#AD245A',
  roseSoft: '#FFE2EB',
  danger: '#B02C32',
  dangerSoft: '#FFE6E1',
  scrim: '#2F203773',
  mediaBackground: '#211827',
  onMedia: '#FFFBF5',
  shadow: '#2F2037',
  unread: '#C32945',
  onUnread: '#FFFFFF',
} as const;

type Palette = {readonly [Key in keyof typeof lightColors]: string};
export type ThemeScheme = 'light' | 'dark';
export type ThemePreference = ThemeScheme | 'system';

const darkColors: Palette = {
  background: '#1C1426',
  surface: '#2C2039',
  elevated: '#392B47',
  field: '#241A31',
  border: '#574262',
  borderBright: '#A286AE',
  text: '#FFF7EA',
  muted: '#D0BEDA',
  accent: '#D2B5FF',
  primary: '#FF8164',
  onPrimary: '#2F2037',
  accentSoft: '#3A284F',
  selection: '#4A3264',
  mint: '#B8E989',
  mintSoft: '#263D30',
  gold: '#FFE087',
  goldSoft: '#49371D',
  sky: '#9EDBFF',
  skySoft: '#24394B',
  rose: '#FFAAC9',
  roseSoft: '#4A293D',
  danger: '#FFB1A3',
  dangerSoft: '#4C292A',
  scrim: '#100818B8',
  mediaBackground: '#130E1B',
  onMedia: '#FFFBF5',
  shadow: '#100818',
  unread: '#C32945',
  onUnread: '#FFFFFF',
};

function createTheme(scheme: ThemeScheme, colors: Palette) {
  const dark = scheme === 'dark';
  return {
    scheme,
    colors,
    gradients: {
      auth: dark ? ['#493055', '#352341', colors.background] as const
        : [colors.goldSoft, '#FFD8CB', colors.background] as const,
      event: ['#FFD56B', '#FF947A'] as const,
      eventAlternate: ['#C1B2FF', '#95DDD0'] as const,
    },
    accents: {
      neutral: {text: colors.text, surface: colors.surface, border: colors.border},
      purple: {text: colors.accent, surface: colors.accentSoft, border: colors.accent},
      mint: {text: colors.mint, surface: colors.mintSoft, border: dark ? '#6E9859' : '#75A46B'},
      gold: {text: colors.gold, surface: colors.goldSoft, border: dark ? '#B89447' : '#BD8B37'},
      sky: {text: colors.sky, surface: colors.skySoft, border: dark ? '#6797B8' : '#78A7C7'},
      rose: {text: colors.rose, surface: colors.roseSoft, border: dark ? '#BD7A94' : '#CD85A1'},
      danger: {text: colors.danger, surface: colors.dangerSoft, border: dark ? '#BA7C72' : '#C98379'},
    },
  } as const;
}

export const themes = {
  light: createTheme('light', lightColors),
  dark: createTheme('dark', darkColors),
};
export type Theme = ReturnType<typeof createTheme>;
export type Accent = keyof Theme['accents'];

// Artwork stays bright in both modes, with its own dark inks for contrast.
export const artwork = {
  purple: lightColors.accent,
  lavender: lightColors.accentSoft,
  green: lightColors.mint,
  mint: lightColors.mintSoft,
  yellow: lightColors.goldSoft,
  rose: lightColors.rose,
} as const;

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
