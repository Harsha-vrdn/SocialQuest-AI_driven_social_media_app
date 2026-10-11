import {createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {Appearance} from 'react-native';
import {themes, type Theme, type ThemePreference, type ThemeScheme} from './theme';
import {readThemePreference, saveThemePreference} from './themePreference';

type ThemeContextValue = {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  preferenceError: string;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);
const currentScheme = (): ThemeScheme => Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';

export function ThemeProvider({children}: PropsWithChildren) {
  // Synchronous local reads let the first app frame use the saved palette.
  const [preference, setSavedPreference] = useState<ThemePreference>(readThemePreference);
  const [deviceScheme, setDeviceScheme] = useState<ThemeScheme>(currentScheme);
  const [preferenceError, setPreferenceError] = useState('');

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({colorScheme}) => {
      setDeviceScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Match native menus/keyboards too. 'unspecified' restores OS following.
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    setDeviceScheme(currentScheme());
  }, [preference]);

  useEffect(() => () => Appearance.setColorScheme('unspecified'), []);

  const setPreference = useCallback((next: ThemePreference) => {
    setSavedPreference(next);
    try {
      saveThemePreference(next);
      setPreferenceError('');
    } catch {
      setPreferenceError('This look is active, but could not be saved. Choose it again to retry.');
    }
  }, []);

  const scheme = preference === 'system' ? deviceScheme : preference;
  const value = useMemo(() => ({theme: themes[scheme], preference, setPreference, preferenceError}),
    [scheme, preference, setPreference, preferenceError]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
