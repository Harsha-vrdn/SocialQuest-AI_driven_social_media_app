import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import type {PropsWithChildren} from 'react';
import {ScrollView, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {MotionModal, SoftPressable as Pressable} from './Motion';
import {fonts} from './theme';

export function EventDetailsSheet({visible, eventId, onClose, children}: PropsWithChildren<{
  visible: boolean; eventId?: number; onClose: () => void;
}>) {
  const {theme} = useTheme();
  const {colors} = theme;
  const styles = getStyles(theme);
  const {height} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <MotionModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.overlay}>
      {/* A sibling backdrop cannot claim gestures that begin in the scroll view. */}
      <Pressable accessible={false} feedback="none" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={[styles.sheet, {height: Math.min(height * 0.9, height - insets.top - 8)}]} accessibilityViewIsModal>
        <View style={styles.toolbar}>
          <Text style={styles.label}>EVENT DETAILS</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close event details" style={styles.close} onPress={onClose}>
            <Ionicons name="close" size={23} color={colors.text} />
          </Pressable>
        </View>
        {/* Explicit bounds keep long descriptions, quests, and moments scrollable.
            Only changing events resets the offset; refreshing this event does not. */}
        <ScrollView key={eventId} accessibilityLabel="Event details" style={styles.scroll}
          contentContainerStyle={[styles.content, {paddingBottom: Math.max(insets.bottom + 16, 28)}]}
          showsVerticalScrollIndicator indicatorStyle={theme.scheme === 'dark' ? 'white' : 'black'} nestedScrollEnabled
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          {children}
        </ScrollView>
      </View>
    </View>
  </MotionModal>;
}

const getStyles = createThemedStyles(({colors}) => ({
  overlay: {flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim},
  sheet: {width: '100%', backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden'},
  toolbar: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border},
  label: {fontFamily: fonts.copy, color: colors.muted, fontSize: 11, lineHeight: 18, letterSpacing: 1},
  close: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  scroll: {flex: 1, minHeight: 0},
  content: {paddingHorizontal: 20, paddingTop: 16},
}));
