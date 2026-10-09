import {createContext, forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren} from 'react';
import {AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, type ModalProps, type PressableProps, type StyleProp, type View, type ViewStyle} from 'react-native';
import {motion} from './theme';

const ReducedMotion = createContext(true);
const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionProvider({children}: PropsWithChildren) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (mounted && !preferenceChanged) setReduced(value);
    }).catch(() => {});
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return <ReducedMotion.Provider value={reduced}>{children}</ReducedMotion.Provider>;
}

export const SoftPressable = forwardRef<View, PressableProps & {feedback?: 'scale' | 'none'}>(function SoftPressable(
  {style, feedback = 'scale', onPressIn, onPressOut, disabled, children, ...props}, ref,
) {
  const reduced = useContext(ReducedMotion);
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const resolvedStyle = typeof style === 'function' ? style({pressed}) : style;
  const flattened = StyleSheet.flatten(resolvedStyle);
  const animate = (down: boolean) => {
    scale.stopAnimation();
    if (reduced || feedback === 'none' || disabled) { scale.setValue(1); return; }
    Animated.timing(scale, {
      toValue: down ? 0.98 : 1,
      duration: down ? motion.press : motion.release,
      easing: easeOut,
      useNativeDriver: true, isInteraction: false,
    }).start();
  };
  useEffect(() => {
    if (disabled || reduced || feedback === 'none') { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [disabled, feedback, reduced, scale]);
  return <AnimatedPressable {...props} ref={ref} disabled={disabled}
    style={[resolvedStyle, feedback !== 'none' && {transform: [...(Array.isArray(flattened?.transform) ? flattened.transform : []), {scale}]}]}
    onPressIn={event => {setPressed(true); animate(true); onPressIn?.(event);}}
    onPressOut={event => {setPressed(false); animate(false); onPressOut?.(event);}}>
    {typeof children === 'function' ? children({pressed}) : children}
  </AnimatedPressable>;
});

// Animate the existing container, so changing tabs never remounts form state.
export function ScreenTransition({children, transitionKey, style}: PropsWithChildren<{transitionKey: string | number; style?: StyleProp<ViewStyle>}>) {
  const reduced = useContext(ReducedMotion);
  const progress = useRef(new Animated.Value(1)).current;
  useLayoutEffect(() => {
    progress.stopAnimation();
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {toValue: 1, duration: motion.enter, easing: easeOut, useNativeDriver: true, isInteraction: false});
    animation.start();
    return () => animation.stop();
  }, [transitionKey, reduced, progress]);
  return <Animated.View style={[style, {opacity: progress.interpolate({inputRange: [0, 1], outputRange: [0.65, 1]}), transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [7, 0]})}]}]}>{children}</Animated.View>;
}

// Fade transparent sheets so their dimming layer no longer slides up the screen.
export function MotionModal({animationType = 'slide', transparent, ...props}: ModalProps) {
  const reduced = useContext(ReducedMotion);
  return <Modal {...props} transparent={transparent} animationType={reduced ? 'none' : transparent ? 'fade' : animationType} />;
}

export function LikeFeedback({children, style}: PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  const reduced = useContext(ReducedMotion);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    const animation = Animated.sequence([
      Animated.timing(progress, {toValue: 1, duration: 200, easing: easeOut, useNativeDriver: true, isInteraction: false}),
      Animated.delay(180),
      Animated.timing(progress, {toValue: 2, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false}),
    ]);
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  return <Animated.View pointerEvents="none" style={[style, {
    opacity: progress.interpolate({inputRange: [0, 1, 2], outputRange: [0, 1, 0]}),
    transform: [{scale: progress.interpolate({inputRange: [0, 1, 2], outputRange: [0.8, 1, 1.05]})}],
  }]}>{children}</Animated.View>;
}
