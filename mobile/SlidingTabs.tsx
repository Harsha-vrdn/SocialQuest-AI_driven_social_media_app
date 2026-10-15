import {useEffect, useRef, useState, type ComponentProps} from 'react';
import {Animated, PanResponder, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SoftPressable as Pressable, Pop, PulseBadge, useReducedMotion} from './Motion';
import {useTheme} from './ThemeProvider';
import {getAppStyles, getGlassStyles} from './appStyles';

type Item<T extends string> = {tab: T; label: string; icon: ComponentProps<typeof Ionicons>['name']; activeIcon: ComponentProps<typeof Ionicons>['name']; badge?: number};
export const tabIndexAt = (x: number, width: number, count: number) => width > 0 && count > 0 ? Math.max(0, Math.min(count - 1, Math.floor(x / (width / count)))) : -1;

// One responder on the tab track lets taps remain buttons and deliberate horizontal
// drags move the selection. Navigation commits only on release, never while scrubbing.
export function SlidingTabs<T extends string>({items, selected, onSelect, translucent}: {
  items: Item<T>[]; selected: T; onSelect: (tab: T) => void; translucent: boolean;
}) {
  const {theme} = useTheme(), {colors} = theme;
  const styles = getAppStyles(theme), glass = getGlassStyles(theme);
  const reduced = useReducedMotion();
  const frame = useRef<View>(null), bounds = useRef({left: 0, width: 0, height: 0});
  const [width, setWidth] = useState(0);
  const currentIndex = Math.max(0, items.findIndex(item => item.tab === selected));
  const offset = useRef(new Animated.Value(0)).current;
  const previous = useRef({selected, width, count: items.length});
  const dragging = useRef(false), rejected = useRef(false);
  const latest = useRef({items, selected, onSelect, reduced}); latest.current = {items, selected, onSelect, reduced};
  const restore = () => {
    dragging.current = false; offset.stopAnimation();
    const index = latest.current.items.findIndex(item => item.tab === latest.current.selected);
    const x = Math.max(0, index) * bounds.current.width / Math.max(1, latest.current.items.length);
    if (latest.current.reduced) offset.setValue(x);
    else Animated.spring(offset, {toValue: x, speed: 26, bounciness: 0, useNativeDriver: true}).start();
  };
  const move = (pageX: number) => {
    const {items} = latest.current, {left, width} = bounds.current;
    const index = tabIndexAt(pageX - left, width, items.length);
    if (index < 0) return;
    const slot = width / items.length;
    offset.setValue(Math.max(0, Math.min(width - slot, pageX - left - slot / 2)));
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {rejected.current = event.nativeEvent.touches.length !== 1; return false;},
    onMoveShouldSetPanResponderCapture: (event, gesture) => {
      if (event.nativeEvent.touches.length !== 1 || Math.abs(gesture.dy) > Math.max(8, Math.abs(gesture.dx))) rejected.current = true;
      return !rejected.current && bounds.current.width > 0 && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3;
    },
    onPanResponderGrant: (_event, gesture) => {dragging.current = true; offset.stopAnimation(); move(gesture.moveX);},
    onPanResponderStart: event => {if (event.nativeEvent.touches.length !== 1) {rejected.current = true; restore();}},
    onPanResponderMove: (event, gesture) => {
      if (event.nativeEvent.touches.length !== 1 || Math.abs(gesture.dy) > Math.max(48, bounds.current.height)) {rejected.current = true; restore();}
      else if (!rejected.current && dragging.current) move(gesture.moveX);
    },
    onPanResponderRelease: (_event, gesture) => {
      const index = tabIndexAt(gesture.moveX - bounds.current.left, bounds.current.width, latest.current.items.length);
      const next = !rejected.current && dragging.current && index >= 0 ? latest.current.items[index].tab : null;
      if (next && next !== latest.current.selected) {
        dragging.current = false;
        latest.current.onSelect(next); // The selected-prop effect snaps into the new slot.
      } else restore();
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {rejected.current = true; restore();},
  })).current;
  useEffect(() => {
    const animate = !reduced && width > 0 && previous.current.width === width
      && previous.current.count === items.length && previous.current.selected !== selected;
    previous.current = {selected, width, count: items.length};
    if (animate) restore();
    else {dragging.current = false; offset.stopAnimation(); offset.setValue(currentIndex * width / Math.max(items.length, 1));}
    return () => offset.stopAnimation();
  }, [selected, width, items.length, currentIndex, reduced]);
  // The pill tracks the pointer; labels retain the committed selection until
  // release. Pointer movement never renders the tab tree.
  const highlighted = selected;
  const hasSelection = items.some(item => item.tab === highlighted);
  return <View ref={frame} collapsable={false} accessibilityRole="tablist" style={{flex: 1, flexDirection: 'row'}} {...responder.panHandlers}
    onLayout={event => {
      const {width, height} = event.nativeEvent.layout;
      // Seed the native node before the first visible indicator is mounted.
      // Resizing preserves selection rather than replaying a tab change.
      if (bounds.current.width !== width) {
        offset.stopAnimation();
        const index = Math.max(0, latest.current.items.findIndex(item => item.tab === latest.current.selected));
        offset.setValue(index * width / Math.max(latest.current.items.length, 1));
      }
      bounds.current = {...bounds.current, width, height}; setWidth(width);
      frame.current?.measureInWindow(left => {bounds.current.left = left;});
    }}>
    {hasSelection && width > 0 ? <Animated.View pointerEvents="none" accessible={false} style={{position: 'absolute', top: 0, bottom: 0, left: 0, width: width / items.length, borderRadius: 16,
      backgroundColor: translucent ? colors.accent + '26' : colors.selection, transform: [{translateX: offset}]}} /> : null}
    {items.map(item => <Pressable key={item.tab} accessibilityRole="tab" accessibilityLabel={item.label + (item.badge ? ', ' + item.badge + ' unread messages' : '')}
      accessibilityHint="Tap to open, or slide across the navigation bar and release to select."
      accessibilityState={{selected: selected === item.tab}} style={[styles.navItem, glass.navItem]} onPress={() => onSelect(item.tab)}>
      <Pop active={highlighted === item.tab}><Ionicons name={highlighted === item.tab ? item.activeIcon : item.icon} size={21} color={highlighted === item.tab ? colors.accent : colors.muted} />
        {item.badge ? <PulseBadge style={styles.navBadge}>{Math.min(99, item.badge)}{item.badge > 99 ? '+' : ''}</PulseBadge> : null}
      </Pop>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.navLabel, highlighted === item.tab && styles.navActive]}>{item.label}</Text>
    </Pressable>)}
  </View>;
}
