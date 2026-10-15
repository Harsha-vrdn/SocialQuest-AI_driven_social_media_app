import {useEffect, useRef, type PropsWithChildren} from 'react';
import {AccessibilityInfo, Animated, Easing, Keyboard, Platform, View, type StyleProp, type ViewStyle} from 'react-native';

// A native-driven fallback for overlap that Android's window resize did not
// consume (for example, a floating keyboard). Never lift an already resized view.
const keyboardEase = Easing.bezier(0.22, 1, 0.36, 1);

// Lifts its children above the keyboard with a native-driven transform.
// KeyboardAvoidingView relayouts the whole chat (and its glass surfaces) on every
// keyboard change; a transform runs on the UI thread, so it stays in step with the keyboard.
export function KeyboardLift({children, style, onLiftChange}: PropsWithChildren<{style?: StyleProp<ViewStyle>; onLiftChange?: (distance: number) => void}>) {
  const frame = useRef<View>(null);
  const lift = useRef(new Animated.Value(0)).current;
  const target = useRef(0);
  const reportedOcclusion = useRef(0), transition = useRef(0);
  const reduceMotion = useRef(true);
  const notifyLift = useRef(onLiftChange); notifyLift.current = onLiftChange;

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    let mounted = true;
    let measurement = 0;
    let preferenceChanged = false;
    notifyLift.current?.(0);
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted && !preferenceChanged) reduceMotion.current = value; }).catch(() => {});
    const motionPreference = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      preferenceChanged = true; reduceMotion.current = value;
      if (mounted && value) {
        transition.current++; lift.stopAnimation(); lift.setValue(-target.current);
        reportedOcclusion.current = target.current; notifyLift.current?.(target.current);
      }
    });

    const moveTo = (distance: number, duration: number) => {
      if (distance === target.current) return;
      target.current = distance;
      const version = ++transition.current;
      // Read receipts stay conservative until the keyboard animation finishes.
      reportedOcclusion.current = Math.max(reportedOcclusion.current, distance);
      notifyLift.current?.(reportedOcclusion.current);
      lift.stopAnimation();
      Animated.timing(lift, {toValue: -distance, duration: reduceMotion.current ? 0 : duration, easing: keyboardEase, useNativeDriver: true, isInteraction: false}).start(({finished}) => {
        if (!mounted || !finished || version !== transition.current) return;
        reportedOcclusion.current = distance; notifyLift.current?.(distance);
      });
    };
    const onChange = (event: {duration?: number; endCoordinates: {screenY: number}}) => {
      const request = ++measurement;
      // Measure the untransformed wrapper: how far its bottom edge sits below the keyboard top.
      frame.current?.measureInWindow((_x, y, _width, height) => {
        if (!mounted || request !== measurement) return;
        const duration = Platform.OS === 'android' ? event.duration || 180 : event.duration ?? 250;
        moveTo(Math.max(y + height - event.endCoordinates.screenY, 0), duration);
      });
    };
    const onHide = (event: {duration?: number}) => {measurement++; moveTo(0, Platform.OS === 'android' ? event.duration || 180 : event.duration ?? 250);};
    const subscriptions = Platform.OS === 'ios' ? [
      Keyboard.addListener('keyboardWillChangeFrame', onChange), Keyboard.addListener('keyboardWillHide', onHide),
    ] : [
      Keyboard.addListener('keyboardDidShow', onChange), Keyboard.addListener('keyboardDidHide', onHide),
    ];
    return () => { mounted = false; motionPreference.remove(); subscriptions.forEach(subscription => subscription.remove()); lift.stopAnimation(); };
  }, [lift]);

  return <View ref={frame} collapsable={false} style={[{flex: 1}, style]}>
    <Animated.View style={{flex: 1, transform: [{translateY: lift}]}}>{children}</Animated.View>
  </View>;
}
