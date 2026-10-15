import type {PropsWithChildren, ReactNode} from 'react';
import {View, type StyleProp, type ViewStyle} from 'react-native';
import {useTheme} from './ThemeProvider';

// Share the screen's wrapper contract with iOS without installing a horizontal
// recognizer or mounting an inbox preview. Android navigation uses Back.
export function SwipeBackView({children, onBack, style}: PropsWithChildren<{
  preview?: ReactNode; onBack: () => void; onGestureActiveChange?: (active: boolean) => void; style?: StyleProp<ViewStyle>;
}>) {
  const {theme: {colors}} = useTheme();
  return <View style={[{flex: 1, backgroundColor: colors.background}, style]} onAccessibilityEscape={onBack}>
    {children}
  </View>;
}
