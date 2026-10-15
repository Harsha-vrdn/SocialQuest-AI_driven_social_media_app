import {useRef, useState, type PropsWithChildren, type ReactNode} from 'react';
import {Animated, Keyboard, View, useWindowDimensions, type StyleProp, type ViewStyle} from 'react-native';
import {useSwipeDismiss} from './useSwipeDismiss';
import {useTheme} from './ThemeProvider';
import {useReducedMotion} from './Motion';

export function SwipeBackView({children, preview, onBack, onGestureActiveChange, style}: PropsWithChildren<{preview?: ReactNode; onBack: () => void; onGestureActiveChange?: (active: boolean) => void; style?: StyleProp<ViewStyle>}>) {
  const {width} = useWindowDimensions();
  const {theme: {colors}} = useTheme();
  const reduced = useReducedMotion();
  const frame = useRef<View>(null);
  const [left, setLeft] = useState(0);
  const swipe = useSwipeDismiss({axis: 'x', distance: width, edgeWidth: 32, edgeStart: left, resetKey: width, onDismiss: onBack, onStart: Keyboard.dismiss, onActiveChange: onGestureActiveChange});
  return <View ref={frame} style={{flex: 1, overflow: 'hidden', backgroundColor: colors.background}} onLayout={() => frame.current?.measureInWindow(x => setLeft(x))} onAccessibilityEscape={onBack} {...swipe.panHandlers}>
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position: 'absolute', inset: 0,
      transform: [{translateX: swipe.offset.interpolate({inputRange: [0, width], outputRange: [reduced ? 0 : -width * 0.18, 0], extrapolate: 'clamp'})}]}}>{preview}</Animated.View>
    <Animated.View pointerEvents="none" style={{position: 'absolute', inset: 0, backgroundColor: colors.shadow,
      opacity: swipe.offset.interpolate({inputRange: [0, width], outputRange: [0.16, 0], extrapolate: 'clamp'})}} />
    <Animated.View style={[style, {flex: 1, backgroundColor: colors.background, shadowColor: colors.shadow, shadowOpacity: 0.16, shadowRadius: 14, elevation: 8, transform: [{translateX: swipe.offset}]}]}>{children}</Animated.View>
  </View>;
}
