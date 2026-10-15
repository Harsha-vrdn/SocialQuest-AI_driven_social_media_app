import {useEffect, useRef, useState} from 'react';
import {Image, PixelRatio, Text, View} from 'react-native';
import {GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {MotionModal, SoftPressable as Pressable} from './Motion';
import {useNativePhotoGestures} from './useNativePhotoGestures';
import {imageRenderLayout} from './imageZoom';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';

export function ImageViewer({uri, onClose}: {uri: string; onClose: () => void}) {
  const {theme} = useTheme(), {colors} = theme;
  const s = getStyles(theme);
  const insets = useSafeAreaInsets();
  const viewport = useRef({width: 0, height: 0});
  const sourceSize = useRef({width: 0, height: 0});
  const [layout, setLayout] = useState<ReturnType<typeof imageRenderLayout>>(null);
  const [percent, setPercent] = useState(100), [failed, setFailed] = useState(false), [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  const fit = () => setLayout(imageRenderLayout(sourceSize.current, viewport.current, PixelRatio.get()));
  useEffect(() => {
    let mounted = true;
    sourceSize.current = {width: 0, height: 0}; setLayout(null); setFailed(false); setLoading(true);
    Image.getSize(uri, (width, height) => {
      if (!mounted) return;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {setFailed(true); setLoading(false); return;}
      sourceSize.current = {width, height}; fit();
    }, () => {if (mounted) {setFailed(true); setLoading(false);}});
    return () => {mounted = false;};
  }, [uri, attempt]);
  const {gesture, transform, dismissOffset, zoomBy, resetZoom} = useNativePhotoGestures({
    image: layout?.fitted ?? {width: 0, height: 0}, viewport: viewport.current, resetKey: uri + ':' + attempt,
    enabled: !!layout && !loading && !failed, onClose, onZoomChange: setPercent,
  });
  const displayScale = layout?.displayScale ?? 1;
  const photoStyle = useAnimatedStyle(() => ({transform: [
    {translateX: transform.value.x}, {translateY: transform.value.y + dismissOffset.value}, {scale: transform.value.scale * displayScale},
  ]}));
  return <MotionModal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
    <GestureHandlerRootView style={[s.screen, {paddingTop: insets.top, paddingBottom: insets.bottom}]} onAccessibilityEscape={onClose}>
      <View style={s.header}><Text style={s.title}>Photo</Text><Pressable accessibilityRole="button" accessibilityLabel="Close photo viewer" style={s.button} onPress={onClose}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>
      <GestureDetector gesture={gesture}><View collapsable={false} style={s.viewport} onLayout={event => {
        const {width, height} = event.nativeEvent.layout;
        if (width !== viewport.current.width || height !== viewport.current.height) {viewport.current = {width, height}; fit();}
      }}>
        {layout ? <Animated.View style={[{width: layout.raster.width, height: layout.raster.height}, photoStyle]}>
          <Image key={uri + ':' + attempt} source={{uri, width: sourceSize.current.width, height: sourceSize.current.height, scale: 1}}
            style={s.image} resizeMode="contain" resizeMethod="resize" accessibilityLabel="Expanded photo"
            onLoad={() => {setLoading(false); setFailed(false);}} onError={() => {setLoading(false); setFailed(true);}} />
        </Animated.View> : null}
        {loading || failed ? <View pointerEvents="none" style={s.status}><Text style={[s.hint, {color: colors.onMedia}]}>{failed ? 'This photo could not be loaded.' : 'Loading photo…'}</Text></View> : null}
      </View></GestureDetector>
      <View style={s.footer}>{failed ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading photo" style={s.reset} onPress={() => setAttempt(current => current + 1)}><Text style={s.label}>Try again</Text></Pressable> : null}
        <Text style={s.hint}>{percent > 100 ? 'Pinch or double-tap to zoom · Drag to explore' : 'Pinch or double-tap to zoom · Swipe down to close'}</Text><View style={s.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={percent <= 100 || loading || failed} style={[s.button, percent <= 100 && s.dim]} onPress={() => zoomBy(1 / 1.5)}><Ionicons name="remove" size={23} color={colors.text} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Reset photo zoom" style={s.reset} onPress={resetZoom}><Text style={s.label}>{percent}% · Reset</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={percent >= 400 || loading || failed} style={[s.button, percent >= 400 && s.dim]} onPress={() => zoomBy(1.5)}><Ionicons name="add" size={23} color={colors.text} /></Pressable>
        </View>
      </View>
    </GestureHandlerRootView>
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
