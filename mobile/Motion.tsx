import {createContext, forwardRef, useContext, useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren, type ReactNode} from 'react';
import {AccessibilityInfo, Animated, Easing, Modal, Pressable, StyleSheet, type LayoutChangeEvent, type ModalProps, type PressableProps, type StyleProp, type TextStyle, type View, type ViewStyle} from 'react-native';
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
    if (down) {
      Animated.timing(scale, {toValue: 0.95, duration: motion.press, easing: easeOut, useNativeDriver: true, isInteraction: false}).start();
    } else {
      Animated.spring(scale, {toValue: 1, speed: 28, bounciness: 12, useNativeDriver: true, isInteraction: false}).start();
    }
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
  return <Animated.View style={[style, {opacity: progress.interpolate({inputRange: [0, 1], outputRange: [0.3, 1]}), transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [16, 0]})}, {scale: progress.interpolate({inputRange: [0, 1], outputRange: [0.985, 1]})}]}]}>{children}</Animated.View>;
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
    transform: [{scale: progress.interpolate({inputRange: [0, 1, 2], outputRange: [0.4, 1.15, 1.35]})}],
  }]}>{children}</Animated.View>;
}

// Cards already shown once keep their place; only newly arrived ones animate in.
const revealed = new Set<string>();

// Fade, rise and scale in with a short stagger for the first few cards on screen.
export function Reveal({children, index = 0, id, style, onLayout}: PropsWithChildren<{index?: number; id?: string; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void}>) {
  const reduced = useContext(ReducedMotion);
  const progress = useRef(new Animated.Value(reduced || (id !== undefined && revealed.has(id)) ? 1 : 0)).current;
  useEffect(() => {
    if (reduced || (id !== undefined && revealed.has(id))) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, {toValue: 1, duration: 420, delay: index < 6 ? index * 70 : 0, easing: easeOut, useNativeDriver: true, isInteraction: false});
    animation.start(({finished}) => {
      if (!finished || id === undefined) return;
      if (revealed.size > 500) revealed.clear();
      revealed.add(id);
    });
    return () => animation.stop();
  }, [id, index, progress, reduced]);
  return <Animated.View onLayout={onLayout} style={[style, {opacity: progress, transform: [{translateY: progress.interpolate({inputRange: [0, 1], outputRange: [24, 0]})}, {scale: progress.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})}]}]}>{children}</Animated.View>;
}

// Drop into FlatList as CellRendererComponent to animate every row without touching renderItem.
export function makeRevealCell(prefix: string) {
  return function RevealCell({cellKey, index, children, style, onLayout}: {cellKey: string; index: number; children?: ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (event: LayoutChangeEvent) => void}) {
    return <Reveal id={prefix + ':' + cellKey} index={index} style={style} onLayout={onLayout}>{children}</Reveal>;
  };
}

// Bounces its child whenever `active` turns on (likes, selected tab icons).
export function Pop({active, children, style}: PropsWithChildren<{active: boolean; style?: StyleProp<ViewStyle>}>) {
  const reduced = useContext(ReducedMotion);
  const scale = useRef(new Animated.Value(1)).current;
  const wasActive = useRef(active);
  useEffect(() => {
    const before = wasActive.current;
    wasActive.current = active;
    if (!active || before || reduced) return;
    scale.setValue(0.7);
    const animation = Animated.spring(scale, {toValue: 1, friction: 3, tension: 170, useNativeDriver: true, isInteraction: false});
    animation.start();
    return () => { animation.stop(); scale.setValue(1); };
  }, [active, reduced, scale]);
  return <Animated.View style={[style, {transform: [{scale}]}]}>{children}</Animated.View>;
}

// Unread badges breathe gently to draw the eye without being noisy.
export function PulseBadge({children, style}: PropsWithChildren<{style?: StyleProp<TextStyle>}>) {
  const reduced = useContext(ReducedMotion);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) { scale.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(scale, {toValue: 1.22, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false}),
      Animated.timing(scale, {toValue: 1, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false}),
      Animated.delay(1400),
    ]));
    animation.start();
    return () => { animation.stop(); scale.setValue(1); };
  }, [reduced, scale]);
  return <Animated.Text style={[style, {transform: [{scale}]}]}>{children}</Animated.Text>;
}
