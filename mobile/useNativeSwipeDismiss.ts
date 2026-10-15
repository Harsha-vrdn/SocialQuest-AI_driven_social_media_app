import {useCallback, useEffect, useMemo, useRef} from 'react';
import {Gesture} from 'react-native-gesture-handler';
import {cancelAnimation, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {shouldDismissSwipe, swipeIntent, type SwipeAxis} from './dismissGestures';
import {useReducedMotion} from './Motion';

type Options = {
  axis: SwipeAxis; distance: number; onDismiss: () => void; onStart?: () => void;
  enabled?: boolean; edgeWidth?: number; resetKey?: string | number;
  onActiveChange?: (active: boolean) => void;
};

// Only gesture boundaries cross to JS. Recognition, pointer tracking, cancellation
// and exit/spring animations all run on the Android UI runtime.
export function useNativeSwipeDismiss(options: Options) {
  const {axis, distance, edgeWidth, resetKey, enabled = true} = options;
  const reduced = useReducedMotion();
  const latest = useRef(options); latest.current = options;
  const mounted = useRef(true);
  const offset = useSharedValue(0), epoch = useSharedValue(0), closing = useSharedValue(false);
  const active = useSharedValue(false), lifecycle = useSharedValue(0);
  const origin = useSharedValue({x: 0, y: 0});
  const notify = useCallback((started: boolean, lifetime: number) => {
    if (!mounted.current || lifecycle.value !== lifetime) return;
    // JS may have been busy for the entire gesture. Publish the current UI
    // state, so delayed start/end jobs cannot re-enable reads during a new drag.
    latest.current.onActiveChange?.(active.value);
    if (started) latest.current.onStart?.();
  }, [active, lifecycle]);
  const finish = useCallback((version: number) => {
    if (mounted.current && epoch.value === version && latest.current.enabled !== false) latest.current.onDismiss();
  }, [epoch]);
  useEffect(() => {
    mounted.current = true;
    lifecycle.value++; epoch.value++; cancelAnimation(offset); offset.value = 0; closing.value = false; active.value = false;
    latest.current.onActiveChange?.(false);
    return () => {
      mounted.current = false; lifecycle.value++; epoch.value++; active.value = false; cancelAnimation(offset);
      latest.current.onActiveChange?.(false);
    };
  }, [enabled, resetKey, distance, reduced, offset, epoch, closing, active, lifecycle]);

  const gesture = useMemo(() => Gesture.Pan().enabled(enabled).manualActivation(true).maxPointers(1)
    .onTouchesDown((event, manager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (closing.value || !touch || event.numberOfTouches !== 1 || (edgeWidth !== undefined && (touch.x < 0 || touch.x > edgeWidth))) {
        manager.fail(); return;
      }
      origin.value = {x: touch.absoluteX, y: touch.absoluteY};
    })
    .onTouchesMove((event, manager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (!touch || event.numberOfTouches !== 1) {manager.fail(); return;}
      const intent = swipeIntent(touch.absoluteX - origin.value.x, touch.absoluteY - origin.value.y, axis);
      if (intent === 'reject') manager.fail();
      else if (intent === 'accept') manager.activate();
    })
    .onStart(() => {
      'worklet';
      epoch.value++; cancelAnimation(offset); closing.value = false; active.value = true;
      scheduleOnRN(notify, true, lifecycle.value);
    })
    .onUpdate(event => {
      'worklet';
      offset.value = Math.max(0, Math.min(distance, axis === 'x' ? event.translationX : event.translationY));
    })
    .onEnd((event, success) => {
      'worklet';
      const along = axis === 'x' ? event.translationX : event.translationY;
      const across = axis === 'x' ? event.translationY : event.translationX;
      const velocity = (axis === 'x' ? event.velocityX : event.velocityY) / 1000;
      if (!success || !shouldDismissSwipe(along, across, velocity, Math.min(96, distance * 0.25))) return;
      closing.value = true;
      const version = ++epoch.value;
      if (reduced) {offset.value = distance; scheduleOnRN(finish, version);}
      else offset.value = withTiming(distance, {duration: 170}, done => {
        if (done && epoch.value === version) scheduleOnRN(finish, version);
      });
    })
    .onFinalize(() => {
      'worklet';
      if (closing.value) return;
      const version = ++epoch.value;
      cancelAnimation(offset);
      if (reduced) {offset.value = 0; active.value = false; scheduleOnRN(notify, false, lifecycle.value);}
      else offset.value = withSpring(0, {damping: 25, stiffness: 250, overshootClamping: true}, done => {
        if (done && epoch.value === version) {active.value = false; scheduleOnRN(notify, false, lifecycle.value);}
      });
    }), [axis, distance, edgeWidth, enabled, reduced, offset, epoch, closing, active, lifecycle, origin, notify, finish]);
  return {gesture, offset};
}
