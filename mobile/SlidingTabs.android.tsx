import {useCallback, useEffect, useMemo, useRef, useState, type ComponentProps} from 'react';
import {Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {cancelAnimation, useAnimatedStyle, useSharedValue, withSpring} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import {SoftPressable as Pressable, Pop, PulseBadge, useReducedMotion} from './Motion';
import {useTheme} from './ThemeProvider';
import {getAppStyles, getGlassStyles} from './appStyles';

type Item<T extends string> = {tab: T; label: string; icon: ComponentProps<typeof Ionicons>['name']; activeIcon: ComponentProps<typeof Ionicons>['name']; badge?: number};
export const tabIndexAt = (x: number, width: number, count: number) => {
  'worklet';
  return width > 0 && count > 0 ? Math.max(0, Math.min(count - 1, Math.floor(x / (width / count)))) : -1;
};

export function SlidingTabs<T extends string>({items, selected, onSelect, translucent}: {
  items: Item<T>[]; selected: T; onSelect: (tab: T) => void; translucent: boolean;
}) {
  const {theme} = useTheme(), {colors} = theme;
  const styles = getAppStyles(theme), glass = getGlassStyles(theme);
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const currentIndex = Math.max(0, items.findIndex(item => item.tab === selected));
  const count = items.length;
  const bounds = useSharedValue({width: 0, height: 0});
  const origin = useSharedValue({x: 0, y: 0});
  // Store a tab position, not pixels: a newly mounted bar starts on the selected
  // tab even before its width is known (for example, returning from a chat).
  const position = useSharedValue(currentIndex), rejected = useSharedValue(false), committed = useSharedValue(false);
  const releaseIndex = useSharedValue(0);
  const previous = useRef({selected, width, count});
  const latest = useRef({items, selected, onSelect}); latest.current = {items, selected, onSelect};
  const mounted = useRef(true);
  const select = useCallback((index: number) => {
    if (!mounted.current) return;
    const item = latest.current.items[index];
    if (item && item.tab !== latest.current.selected) latest.current.onSelect(item.tab);
  }, []);
  useEffect(() => {
    mounted.current = true;
    cancelAnimation(position);
    const animate = !reduced && width > 0 && previous.current.width === width
      && previous.current.count === count && previous.current.selected !== selected;
    position.value = animate ? withSpring(currentIndex, {damping: 25, stiffness: 250, overshootClamping: true}) : currentIndex;
    previous.current = {selected, width, count};
    return () => {mounted.current = false; cancelAnimation(position);};
  }, [selected, width, count, currentIndex, reduced, position]);

  const pan = useMemo(() => Gesture.Pan().manualActivation(true).maxPointers(1)
    .onTouchesDown((event, manager) => {
      'worklet';
      const touch = event.allTouches[0]; rejected.value = false; committed.value = false;
      if (!touch || event.numberOfTouches !== 1 || bounds.value.width <= 0) {manager.fail(); return;}
      origin.value = {x: touch.absoluteX, y: touch.absoluteY};
    })
    .onTouchesMove((event, manager) => {
      'worklet';
      const touch = event.allTouches[0];
      if (rejected.value || !touch || event.numberOfTouches !== 1) {manager.fail(); return;}
      const dx = touch.absoluteX - origin.value.x, dy = touch.absoluteY - origin.value.y;
      if (Math.abs(dy) > Math.max(48, bounds.value.height) || Math.abs(dy) > Math.max(8, Math.abs(dx))) {rejected.value = true; manager.fail();}
      else if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) manager.activate();
    })
    .onStart(() => {'worklet'; cancelAnimation(position);})
    .onUpdate(event => {
      'worklet';
      if (event.numberOfPointers !== 1 || Math.abs(event.translationY) > Math.max(48, bounds.value.height)) {rejected.value = true; return;}
      const slot = bounds.value.width / Math.max(count, 1);
      if (slot > 0) position.value = Math.max(0, Math.min(count - 1, event.x / slot - 0.5));
    })
    .onEnd((event, success) => {
      'worklet';
      if (!success || rejected.value) return;
      const index = tabIndexAt(event.x, bounds.value.width, count);
      if (index >= 0) {committed.value = true; releaseIndex.value = index; scheduleOnRN(select, index);}
    })
    .onFinalize(() => {
      'worklet';
      const index = committed.value ? releaseIndex.value : currentIndex;
      const target = Math.max(0, index);
      position.value = reduced ? target : withSpring(target, {damping: 25, stiffness: 250, overshootClamping: true});
    }), [bounds, origin, position, rejected, committed, releaseIndex, count, currentIndex, reduced, select]);
  const indicator = useAnimatedStyle(() => ({transform: [{translateX: position.value * width / Math.max(count, 1)}]}));
  return <GestureDetector gesture={pan}><View accessibilityRole="tablist" style={{flex: 1, flexDirection: 'row'}}
    onLayout={event => {const {width, height} = event.nativeEvent.layout; bounds.value = {width, height}; setWidth(width);}}>
    {items.some(item => item.tab === selected) && width > 0 ? <Animated.View pointerEvents="none" accessible={false}
      style={[{position: 'absolute', top: 0, bottom: 0, left: 0, width: width / Math.max(count, 1), borderRadius: 16,
        backgroundColor: translucent ? colors.accent + '26' : colors.selection}, indicator]} /> : null}
    {items.map(item => <Pressable key={item.tab} accessibilityRole="tab" accessibilityLabel={item.label + (item.badge ? ', ' + item.badge + ' unread messages' : '')}
      accessibilityHint="Tap to open, or slide across the navigation bar and release to select."
      accessibilityState={{selected: selected === item.tab}} style={[styles.navItem, glass.navItem]} onPress={() => onSelect(item.tab)}>
      <Pop active={selected === item.tab}><Ionicons name={selected === item.tab ? item.activeIcon : item.icon} size={21} color={selected === item.tab ? colors.accent : colors.muted} />
        {item.badge ? <PulseBadge style={styles.navBadge}>{Math.min(99, item.badge)}{item.badge > 99 ? '+' : ''}</PulseBadge> : null}
      </Pop>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.navLabel, selected === item.tab && styles.navActive]}>{item.label}</Text>
    </Pressable>)}
  </View></GestureDetector>;
}
