import {useCallback, useEffect, useMemo, useRef} from 'react';
import {Gesture} from 'react-native-gesture-handler';
import {cancelAnimation, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import {scheduleOnRN, scheduleOnUI} from 'react-native-worklets';
import {shouldDismissSwipe, swipeIntent} from './dismissGestures';
import {boundTransform, focalZoom, type Point, type Size, type Transform} from './imageZoom';
import {useReducedMotion} from './Motion';

type Options = {image: Size; viewport: Size; resetKey: string; enabled: boolean; onClose: () => void; onZoomChange: (percent: number) => void};
const initial: Transform = {scale: 1, x: 0, y: 0};

export function useNativePhotoGestures({image, viewport, resetKey, enabled, onClose, onZoomChange}: Options) {
  const reduced = useReducedMotion();
  const latest = useRef({onClose, onZoomChange, resetKey}); latest.current = {onClose, onZoomChange, resetKey};
  const mounted = useRef(true);
  const transform = useSharedValue<Transform>({...initial});
  const geometry = useSharedValue({image, viewport});
  const dismissOffset = useSharedValue(0), epoch = useSharedValue(0), closing = useSharedValue(false);
  const multi = useSharedValue(false), pinching = useSharedValue(false);
  const dismissal = useSharedValue({active: false, rejected: false});
  const panState = useSharedValue({start: {...initial}, baseX: 0, baseY: 0, lastX: 0, lastY: 0});
  const pinchState = useSharedValue({start: {...initial}, origin: {x: 0, y: 0}});
  const announce = useCallback((percent: number, key: string, version: number) => {
    if (mounted.current && latest.current.resetKey === key && epoch.value === version) latest.current.onZoomChange(percent);
  }, [epoch]);
  const close = useCallback((version: number, key: string) => {
    if (mounted.current && latest.current.resetKey === key && epoch.value === version) latest.current.onClose();
  }, [epoch]);

  useEffect(() => {
    mounted.current = true; epoch.value++; cancelAnimation(dismissOffset);
    geometry.value = {image, viewport}; transform.value = {...initial}; dismissOffset.value = 0;
    closing.value = false; multi.value = false; pinching.value = false;
    onZoomChange(100);
    return () => {mounted.current = false; epoch.value++; cancelAnimation(dismissOffset);};
  }, [image.width, image.height, viewport.width, viewport.height, resetKey, geometry, transform, dismissOffset, epoch, closing, multi, pinching, onZoomChange]);

  const apply = useCallback((next: Transform) => {
    'worklet';
    transform.value = boundTransform(next, geometry.value.image, geometry.value.viewport);
  }, [transform, geometry]);
  const cancelDismiss = useCallback(() => {
    'worklet';
    epoch.value++; closing.value = false; dismissal.value = {active: false, rejected: true};
    cancelAnimation(dismissOffset);
    dismissOffset.value = reduced ? 0 : withSpring(0, {damping: 25, stiffness: 250, overshootClamping: true});
  }, [epoch, closing, dismissal, dismissOffset, reduced]);
  const zoomAt = useCallback((scale: number, point: Point) => {
    'worklet';
    if (closing.value) return;
    cancelDismiss(); apply(focalZoom(transform.value, scale, point, point));
    scheduleOnRN(announce, Math.round(transform.value.scale * 100), resetKey, epoch.value);
  }, [closing, cancelDismiss, apply, transform, announce, resetKey]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().enabled(enabled).minDistance(8).averageTouches(true)
      .onTouchesDown((event, manager) => {
        'worklet';
        if (closing.value) {manager.fail(); return;}
        if (event.numberOfTouches === 1) {
          epoch.value++; cancelAnimation(dismissOffset); dismissOffset.value = 0;
          multi.value = false; dismissal.value = {active: false, rejected: false};
        } else {multi.value = true; cancelDismiss();}
      })
      .onStart(() => {
        'worklet';
        panState.value = {start: {...transform.value}, baseX: 0, baseY: 0, lastX: 0, lastY: 0};
      })
      .onUpdate(event => {
        'worklet';
        const start = panState.value;
        panState.value = {...start, lastX: event.translationX, lastY: event.translationY};
        if (pinching.value || event.numberOfPointers > 1) {multi.value = true; return;}
        const dx = event.translationX - start.baseX, dy = event.translationY - start.baseY;
        if (!multi.value && start.start.scale === 1 && !dismissal.value.rejected) {
          const intent = swipeIntent(dx, dy, 'y');
          if (intent === 'reject' && !dismissal.value.active) dismissal.value = {active: false, rejected: true};
          if (intent === 'accept' || dismissal.value.active) {
            dismissal.value = {active: true, rejected: false};
            dismissOffset.value = Math.max(0, Math.min(dy, geometry.value.viewport.height)); return;
          }
        }
        apply({...start.start, x: start.start.x + dx, y: start.start.y + dy});
      })
      .onEnd((event, success) => {
        'worklet';
        if (!success || !dismissal.value.active || multi.value) return;
        if (!shouldDismissSwipe(event.translationY, event.translationX, event.velocityY / 1000)) return;
        closing.value = true; const version = ++epoch.value;
        if (reduced) {dismissOffset.value = geometry.value.viewport.height; scheduleOnRN(close, version, resetKey);}
        else dismissOffset.value = withTiming(geometry.value.viewport.height, {duration: 170}, done => {
          if (done && epoch.value === version) scheduleOnRN(close, version, resetKey);
        });
      })
      .onFinalize(() => {
        'worklet';
        if (!closing.value) cancelDismiss();
        scheduleOnRN(announce, Math.round(transform.value.scale * 100), resetKey, epoch.value);
      });
    const pinch = Gesture.Pinch().enabled(enabled)
      .onTouchesDown((_event, manager) => {'worklet'; if (closing.value) manager.fail();})
      .onStart(event => {
        'worklet';
        multi.value = true; pinching.value = true; cancelDismiss();
        pinchState.value = {start: {...transform.value}, origin: {
          x: event.focalX - geometry.value.viewport.width / 2, y: event.focalY - geometry.value.viewport.height / 2,
        }};
      })
      .onUpdate(event => {
        'worklet';
        const start = pinchState.value;
        apply(focalZoom(start.start, start.start.scale * event.scale, start.origin, {
          x: event.focalX - geometry.value.viewport.width / 2, y: event.focalY - geometry.value.viewport.height / 2,
        }));
      })
      .onFinalize(() => {
        'worklet';
        pinching.value = false;
        // Continue a remaining finger without jumping back to pre-pinch offsets.
        panState.value = {...panState.value, start: {...transform.value}, baseX: panState.value.lastX, baseY: panState.value.lastY};
        scheduleOnRN(announce, Math.round(transform.value.scale * 100), resetKey, epoch.value);
      });
    const doubleTap = Gesture.Tap().enabled(enabled).numberOfTaps(2).maxDelay(300).maxDuration(300).maxDistance(8)
      .onEnd((event, success) => {
        'worklet';
        if (success && !closing.value) zoomAt(transform.value.scale > 1 ? 1 : 2.5, {
          x: event.x - geometry.value.viewport.width / 2, y: event.y - geometry.value.viewport.height / 2,
        });
      });
    return Gesture.Simultaneous(pan, pinch, doubleTap);
  }, [enabled, reduced, closing, epoch, dismissOffset, multi, pinching, dismissal, panState, pinchState, transform, geometry, apply, cancelDismiss, zoomAt, announce, close, resetKey]);

  return {gesture, transform, dismissOffset,
    zoomBy: (factor: number) => scheduleOnUI(() => {'worklet'; zoomAt(transform.value.scale * factor, {x: 0, y: 0});}),
    resetZoom: () => scheduleOnUI(zoomAt, 1, {x: 0, y: 0}),
  };
}
