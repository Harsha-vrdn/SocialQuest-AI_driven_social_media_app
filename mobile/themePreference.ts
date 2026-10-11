import {File, Paths} from 'expo-file-system';
import type {ThemePreference} from './theme';

const preferenceFile = () => new File(Paths.document, 'appearance.json');

export function readThemePreference(): ThemePreference {
  try {
    const {appearance} = JSON.parse(preferenceFile().textSync());
    if (appearance === 'light' || appearance === 'dark' || appearance === 'system') return appearance;
  } catch { /* New installs and unreadable preferences follow the device. */ }
  return 'system';
}

export function saveThemePreference(appearance: ThemePreference) {
  preferenceFile().write(JSON.stringify({appearance}));
}
