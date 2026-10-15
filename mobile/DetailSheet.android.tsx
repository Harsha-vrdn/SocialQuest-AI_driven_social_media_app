import type {PropsWithChildren, ReactNode} from 'react';
import {Keyboard, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle} from 'react-native-reanimated';
import {Ionicons} from '@expo/vector-icons';
import {MotionModal, SoftPressable as Pressable} from './Motion';
import {useNativeSwipeDismiss} from './useNativeSwipeDismiss';
import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';
import {GlassBackdrop} from './GlassBackdrop';

export function DetailSheet({visible, sheetKey, title, closeLabel, onClose, headerLeft, headerActions, heightRatio = 0.9, children}: PropsWithChildren<{
  visible: boolean; sheetKey?: string | number; title: string; closeLabel: string; onClose: () => void;
  headerLeft?: ReactNode; headerActions?: ReactNode; heightRatio?: number;
}>) {
  const {theme} = useTheme();
  const styles = getStyles(theme);
  const {height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const close = () => {Keyboard.dismiss(); onClose();};
  const {gesture, offset} = useNativeSwipeDismiss({axis: 'y', distance: height, enabled: visible, resetKey: sheetKey, onDismiss: close});
  const transform = useAnimatedStyle(() => ({transform: [{translateY: offset.value}]}));
  return <MotionModal visible={visible} transparent presentationStyle="overFullScreen" animationType="fade" onRequestClose={close}>
    {/* Android Modal owns a separate native window and needs its own gesture root.
        That window already uses adjustResize: a second JS keyboard layout fights it. */}
    <GestureHandlerRootView style={styles.overlay}>
      <Pressable accessible={false} feedback="none" style={StyleSheet.absoluteFill} onPress={close} />
      <Animated.View style={[styles.sheet, {height: Math.min(height * heightRatio, height - insets.top - 8)}, transform]}
        accessibilityViewIsModal onAccessibilityEscape={close}>
        <GestureDetector gesture={gesture}><View collapsable={false}>
          <View style={styles.grabArea} pointerEvents="none"><View style={styles.grabHandle} />
            <Text style={styles.dragHint}>Drag this header down to close</Text>
          </View>
          <View style={styles.toolbar}>
            {headerLeft || <Text style={styles.label}>{title}</Text>}
            <View style={styles.actions}>{headerActions}<Pressable accessibilityRole="button" accessibilityLabel={closeLabel} style={styles.close} onPress={close}>
              <GlassBackdrop native radius={22} /><Ionicons name="close" size={23} color={theme.colors.text} />
            </Pressable></View>
          </View>
        </View></GestureDetector>
        <View style={[styles.body, {paddingBottom: Math.max(insets.bottom, 12)}]}>{children}</View>
      </Animated.View>
    </GestureHandlerRootView>
  </MotionModal>;
}

const getStyles = createThemedStyles(({colors}) => ({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim},
  sheet: {width: '100%', maxHeight: '100%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden'},
  body: {flex: 1, minHeight: 0, paddingHorizontal: 20},
  toolbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border},
  grabArea: {alignItems: 'center', paddingTop: 10, gap: 4},
  grabHandle: {width: 36, height: 4, borderRadius: 2, backgroundColor: colors.muted},
  dragHint: {fontFamily: fonts.copy, fontSize: 10, color: colors.muted},
  label: {fontFamily: fonts.copy, color: colors.muted, fontSize: 11, lineHeight: 18, letterSpacing: 1},
  actions: {flexDirection: 'row', alignItems: 'center', gap: 8},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
}));
