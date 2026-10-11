import {useEffect, useRef, type PropsWithChildren} from 'react';
import {AccessibilityInfo, Animated, Easing, Keyboard, Platform, View, type StyleProp, type ViewStyle} from 'react-native';

// iOS keyboard curve, approximated so the content tracks the keyboard instead of trailing it.
const keyboardEase = Easing.bezier(0.22, 1, 0.36, 1);

// Lifts its children above the keyboard with a native-driven transform.
// KeyboardAvoidingView relayouts the whole chat (and its glass surfaces) on every
// keyboard change; a transform runs on the UI thread, so it stays in step with the keyboard.
export function KeyboardLift({children, style}: PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  const frame = useRef<View>(null);
  const lift = useRef(new Animated.Value(0)).current;
  const target = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduceMotion.current = value; }).catch(() => {});
    const motionPreference = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { reduceMotion.current = value; });

    const moveTo = (distance: number, duration: number) => {
      if (distance === target.current) return;
      target.current = distance;
      lift.stopAnimation();
      Animated.timing(lift, {toValue: -distance, duration: reduceMotion.current ? 0 : duration, easing: keyboardEase, useNativeDriver: true, isInteraction: false}).start();
    };
    const onChange = (event: {duration?: number; endCoordinates: {screenY: number}}) => {
      // Measure the untransformed wrapper: how far its bottom edge sits below the keyboard top.
      frame.current?.measureInWindow((_x, y, _width, height) => {
        if (!mounted) return;
        moveTo(Math.max(y + height - event.endCoordinates.screenY, 0), event.duration ?? 250);
      });
    };
    const onHide = (event: {duration?: number}) => moveTo(0, event.duration ?? 250);
    const subscriptions = [
      Keyboard.addListener('keyboardWillChangeFrame', onChange),
      Keyboard.addListener('keyboardWillHide', onHide),
    ];
    return () => { mounted = false; motionPreference.remove(); subscriptions.forEach(subscription => subscription.remove()); lift.stopAnimation(); };
  }, [lift]);

  return <View ref={frame} collapsable={false} style={[{flex: 1}, style]}>
    <Animated.View style={{flex: 1, transform: [{translateY: lift}]}}>{children}</Animated.View>
  </View>;
}
