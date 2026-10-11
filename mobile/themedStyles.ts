import {StyleSheet} from 'react-native';
import type {Theme} from './theme';

// Cache immutable styles per palette; switching never mutates another screen's styles.
export function createThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  const cache = new WeakMap<Theme, T>();
  return (theme: Theme): T => {
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
