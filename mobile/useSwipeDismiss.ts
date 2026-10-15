import {useEffect, useRef} from 'react';
import {Animated, PanResponder} from 'react-native';
import {useReducedMotion} from './Motion';
import {shouldDismissSwipe, swipeIntent, type SwipeAxis} from './dismissGestures';

type Options = {
  axis: SwipeAxis; distance: number; onDismiss: () => void; onStart?: () => void;
  enabled?: boolean; edgeWidth?: number; edgeStart?: number; resetKey?: string | number;
  onActiveChange?: (active: boolean) => void;
};

// iOS/web responder fallback. Android gesture surfaces select their .android
// components and use useNativeSwipeDismiss, keeping move events off JS entirely.
export function useSwipeDismiss(options: Options) {
  const reduced = useReducedMotion();
  const current = useRef({...options, reduced}); current.current = {...options, reduced};
  const offset = useRef(new Animated.Value(0)).current;
  const rejected = useRef(false), busy = useRef(false), generation = useRef(0);
  const cancel = () => {
    const version = ++generation.current; busy.current = false; offset.stopAnimation();
    const finish = () => {if (version === generation.current) current.current.onActiveChange?.(false);};
    if (current.current.reduced) {offset.setValue(0); finish();}
    else Animated.spring(offset, {toValue: 0, speed: 24, bounciness: 0, useNativeDriver: true}).start(({finished}) => {if (finished) finish();});
  };
  useEffect(() => {
    generation.current++; busy.current = false; rejected.current = false;
    offset.stopAnimation(); offset.setValue(0);
    current.current.onActiveChange?.(false);
    return () => {generation.current++; offset.stopAnimation(); current.current.onActiveChange?.(false);};
  }, [options.resetKey, options.enabled, offset]);

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {
      if (event.nativeEvent.touches.length === 1) rejected.current = false;
      else rejected.current = true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (event, gesture) => {
      const config = current.current;
      if (config.enabled === false || busy.current || rejected.current) return false;
      const start = gesture.moveX - gesture.dx, edge = config.edgeStart || 0;
      if (event.nativeEvent.touches.length !== 1 || (config.edgeWidth !== undefined && (start < edge || start > edge + config.edgeWidth))) {
        rejected.current = true; return false;
      }
      const intent = swipeIntent(gesture.dx, gesture.dy, config.axis);
      if (intent === 'reject') rejected.current = true;
      return intent === 'accept';
    },
    onPanResponderGrant: () => {generation.current++; rejected.current = false; offset.stopAnimation(); current.current.onActiveChange?.(true); current.current.onStart?.();},
    onPanResponderStart: event => {if (!rejected.current && event.nativeEvent.touches.length > 1) {rejected.current = true; cancel();}},
    onPanResponderMove: (event, gesture) => {
      if (rejected.current) return;
      if (event.nativeEvent.touches.length !== 1) {rejected.current = true; cancel(); return;}
      const distance = current.current.axis === 'x' ? gesture.dx : gesture.dy;
      offset.setValue(Math.max(0, Math.min(distance, current.current.distance)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const config = current.current;
      const distance = config.axis === 'x' ? gesture.dx : gesture.dy;
      const across = config.axis === 'x' ? gesture.dy : gesture.dx;
      const velocity = config.axis === 'x' ? gesture.vx : gesture.vy;
      if (rejected.current || config.enabled === false || !shouldDismissSwipe(distance, across, velocity, Math.min(96, config.distance * 0.25))) {cancel(); return;}
      busy.current = true;
      const version = ++generation.current;
      const finish = () => {if (version === generation.current && current.current.enabled !== false) current.current.onDismiss();};
      if (config.reduced) finish();
      else Animated.timing(offset, {toValue: config.distance, duration: 170, useNativeDriver: true}).start(({finished}) => {if (finished) finish();});
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {rejected.current = true; cancel();},
  })).current;
  return {offset, panHandlers: responder.panHandlers};
}
