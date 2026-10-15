import type {PropsWithChildren} from 'react';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {useTheme} from './ThemeProvider';

export function GestureRoot({children}: PropsWithChildren) {
  const {theme} = useTheme();
  return <GestureHandlerRootView style={{flex: 1, backgroundColor: theme.colors.background}}>{children}</GestureHandlerRootView>;
}
