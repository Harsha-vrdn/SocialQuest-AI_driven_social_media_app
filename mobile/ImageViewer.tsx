import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {useEffect, useRef, useState} from 'react';
import {Animated, Image, PanResponder, PixelRatio, Text, View, type GestureResponderEvent} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MotionModal, SoftPressable as Pressable, useReducedMotion} from './Motion';
import {shouldDismissSwipe, swipeIntent} from './dismissGestures';
import {fonts} from './theme';
import {boundTransform, imageRenderLayout, focalZoom, type Point, type Transform} from './imageZoom';

const initial: Transform = {scale: 1, x: 0, y: 0};
export function ImageViewer({uri, onClose}: {uri: string; onClose: () => void}) {
  const {theme} = useTheme();
  const {colors} = theme;
  const s = getStyles(theme);
  const insets = useSafeAreaInsets();
  const frame = useRef<View>(null);
  const viewport = useRef({width: 0, height: 0, pageX: 0, pageY: 0});
  const sourceSize = useRef({width: 0, height: 0});
  const [layout, setLayout] = useState<ReturnType<typeof imageRenderLayout>>(null);
  const imageSize = useRef({width: 0, height: 0});
  const [percent, setPercent] = useState(100);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const value = useRef<Transform>({...initial});
  const scale = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const gesture = useRef({start: {...initial}, point: {x: 0, y: 0}, distance: 1, count: 0, moved: false, multi: false, time: 0});
  const lastTap = useRef<{time: number; point: Point} | null>(null);
  const dismissY = useRef(new Animated.Value(0)).current;
  const dismiss = useRef({active: false, rejected: false, closing: false, version: 0});
  const reduced = useReducedMotion();
  const actions = useRef({onClose, reduced}); actions.current = {onClose, reduced};
  const cancelDismiss = () => {
    dismiss.current.version++; dismiss.current.active = false; dismiss.current.closing = false;
    dismissY.stopAnimation();
    if (actions.current.reduced) dismissY.setValue(0);
    else Animated.spring(dismissY, {toValue: 0, speed: 24, bounciness: 0, useNativeDriver: true}).start();
  };

  const apply = (next: Transform, announce = false) => {
    const bounded = boundTransform(next, imageSize.current, viewport.current);
    value.current = bounded;
    scale.setValue(bounded.scale); x.setValue(bounded.x); y.setValue(bounded.y);
    if (announce) setPercent(Math.round(bounded.scale * 100));
  };
  const fit = () => {
    const next = imageRenderLayout(sourceSize.current, viewport.current, PixelRatio.get());
    if (!next) return;
    cancelDismiss();
    imageSize.current = next.fitted; setLayout(next); apply({...initial}, true); lastTap.current = null;
  };
  useEffect(() => {
    let mounted = true;
    sourceSize.current = {width: 0, height: 0};
    dismiss.current.version++; dismiss.current.active = false; dismiss.current.closing = false;
    dismissY.stopAnimation(); dismissY.setValue(0);
    setLayout(null); setFailed(false); setLoading(true);
    Image.getSize(uri, (width, height) => {
      if (!mounted) return;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {setFailed(true); setLoading(false); return;}
      sourceSize.current = {width, height}; fit();
    }, () => { if (mounted) {setFailed(true); setLoading(false);} });
    return () => { mounted = false; dismiss.current.version++; dismissY.stopAnimation(); };
  }, [uri, attempt]);
  const points = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    const first = touches[0], second = touches[1];
    if (!first) return null;
    const pageX = second ? (first.pageX + second.pageX) / 2 : first.pageX;
    const pageY = second ? (first.pageY + second.pageY) / 2 : first.pageY;
    return {count: Math.min(2, touches.length), point: {x: pageX - viewport.current.pageX - viewport.current.width / 2, y: pageY - viewport.current.pageY - viewport.current.height / 2},
      distance: second ? Math.max(1, Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY)) : 1};
  };
  const zoom = (nextScale: number, point: Point = {x: 0, y: 0}) => {
    apply(focalZoom(value.current, nextScale, point, point), true);
    lastTap.current = null;
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !dismiss.current.closing,
    onMoveShouldSetPanResponder: () => !dismiss.current.closing,
    onPanResponderGrant: event => {
      const next = points(event); if (!next) return;
      cancelDismiss(); dismissY.setValue(0); dismiss.current.rejected = false;
      gesture.current = {...next, start: {...value.current}, moved: false, multi: next.count > 1, time: Date.now()};
    },
    onPanResponderStart: event => {
      if (event.nativeEvent.touches.length > 1) {
        gesture.current.multi = true; dismiss.current.rejected = true; cancelDismiss(); lastTap.current = null;
      }
    },
    onPanResponderMove: event => {
      const next = points(event); if (!next) return;
      const start = gesture.current;
      if (next.count !== start.count) {
        dismiss.current.rejected = true; cancelDismiss();
        gesture.current = {...start, ...next, start: {...value.current}, moved: true, multi: true};
        return;
      }
      if (Math.hypot(next.point.x - start.point.x, next.point.y - start.point.y) > 8 || next.count > 1) start.moved = true;
      if (next.count === 1 && !start.multi && start.start.scale === 1 && !dismiss.current.rejected) {
        const dx = next.point.x - start.point.x, dy = next.point.y - start.point.y;
        const intent = swipeIntent(dx, dy, 'y');
        if (intent === 'reject' && !dismiss.current.active) dismiss.current.rejected = true;
        if (intent === 'accept' || dismiss.current.active) {
          dismiss.current.active = true; dismissY.stopAnimation();
          dismissY.setValue(Math.max(0, Math.min(dy, viewport.current.height)));
          return;
        }
      }
      const target = next.count > 1
        ? focalZoom(start.start, start.start.scale * next.distance / start.distance, start.point, next.point)
        : {...start.start, x: start.start.x + next.point.x - start.point.x, y: start.start.y + next.point.y - start.point.y};
      apply(target);
    },
    onPanResponderRelease: (_event, state) => {
      const current = gesture.current, now = Date.now();
      if (dismiss.current.active) {
        lastTap.current = null;
        if (!current.multi && shouldDismissSwipe(state.dy, state.dx, state.vy)) {
          dismiss.current.closing = true;
          const version = ++dismiss.current.version;
          const finish = () => {if (version === dismiss.current.version) actions.current.onClose();};
          if (actions.current.reduced) finish();
          else Animated.timing(dismissY, {toValue: viewport.current.height, duration: 170, useNativeDriver: true}).start(({finished}) => {if (finished) finish();});
        } else cancelDismiss();
        return;
      }
      if (!current.moved && !current.multi && now - current.time < 300) {
        const previous = lastTap.current;
        if (previous && now - previous.time < 300 && Math.hypot(previous.point.x - current.point.x, previous.point.y - current.point.y) < 40) {
          zoom(value.current.scale > 1 ? 1 : 2.5, current.point);
        } else lastTap.current = {time: now, point: current.point};
      } else lastTap.current = null;
      setPercent(Math.round(value.current.scale * 100));
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => {cancelDismiss(); lastTap.current = null; setPercent(Math.round(value.current.scale * 100));},
  })).current;

  return <MotionModal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={[s.screen, {paddingTop: insets.top, paddingBottom: insets.bottom}]} onAccessibilityEscape={onClose}>
      <View style={s.header}><Text style={s.title}>Photo</Text><Pressable accessibilityRole="button" accessibilityLabel="Close photo viewer" style={s.button} onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>
      <View ref={frame} style={s.viewport} onLayout={event => {
        viewport.current = {...viewport.current, ...event.nativeEvent.layout};
        frame.current?.measureInWindow((pageX, pageY) => {viewport.current = {...viewport.current, pageX, pageY};});
        fit();
      }} {...responder.panHandlers}>
        {layout ? <Animated.View style={{width: layout.raster.width, height: layout.raster.height, transform: [{translateX: x}, {translateY: Animated.add(y, dismissY)}, {scale: Animated.multiply(scale, layout.displayScale)}]}}>
          <Image key={uri + ':' + attempt} source={{uri, width: sourceSize.current.width, height: sourceSize.current.height, scale: 1}} style={s.image} resizeMode="contain" resizeMethod="resize" accessibilityLabel="Expanded photo"
            onLoad={() => {setLoading(false); setFailed(false);}} onError={() => {setLoading(false); setFailed(true);}} />
        </Animated.View> : null}
        {loading || failed ? <View pointerEvents="none" style={s.status}><Text style={[s.hint, {color: colors.onMedia}]}>{failed ? 'This photo could not be loaded.' : 'Loading photo…'}</Text></View> : null}
      </View>
      <View style={s.footer}>{failed ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading photo" style={s.reset} onPress={() => setAttempt(current => current + 1)}><Text style={s.label}>Try again</Text></Pressable> : null}<Text style={s.hint}>{percent > 100 ? 'Pinch or double-tap to zoom · Drag to explore' : 'Pinch or double-tap to zoom · Swipe down to close'}</Text><View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={percent <= 100 || loading || failed} style={[s.button, percent <= 100 && s.dim]} onPress={() => zoom(value.current.scale / 1.5)}><Ionicons name="remove" size={23} color={colors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset photo zoom" style={s.reset} onPress={() => zoom(1)}><Text style={s.label}>{percent}% · Reset</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={percent >= 400 || loading || failed} style={[s.button, percent >= 400 && s.dim]} onPress={() => zoom(value.current.scale * 1.5)}><Ionicons name="add" size={23} color={colors.text} /></Pressable>
      </View></View>
    </View>
  </MotionModal>;
}

const getStyles = createThemedStyles(({colors}) => ({
  screen: {flex: 1, backgroundColor: colors.background},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12},
  title: {fontFamily: fonts.heading, fontSize: 16, color: colors.text},
  viewport: {flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mediaBackground},
  image: {width: '100%', height: '100%'},
  status: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', padding: 32},
  footer: {padding: 16, gap: 12},
  hint: {fontFamily: fonts.copy, fontSize: 14, lineHeight: 20, color: colors.muted, textAlign: 'center'},
  controls: {flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16},
  button: {width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface},
  reset: {minHeight: 44, minWidth: 128, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: colors.accentSoft},
  label: {fontFamily: fonts.bold, fontSize: 14, color: colors.accent},
  dim: {opacity: 0.4},
}));
