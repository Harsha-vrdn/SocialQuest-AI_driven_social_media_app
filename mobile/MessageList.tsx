import {useLayoutEffect, useRef} from 'react';
import {FlatList, View, type CellRendererProps, type FlatListProps, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken} from 'react-native';

type Message = {id: number; sender: {id: number}};
type Props<T extends Message> = Omit<FlatListProps<T>, 'data' | 'inverted'> & {data: T[]; currentUserId?: number; onReadThrough?: (id: number) => void; occludedTop?: number; occludedBottom?: number};
const readVisibility = {viewAreaCoveragePercentThreshold: 50, minimumViewTime: 250};

export function shouldFollowLatest(following: boolean, previousId: number | null, latest: Message | undefined, currentUserId?: number) {
  return following || !!(latest && latest.id !== previousId && latest.sender.id === currentUserId);
}

export function visibleAboveChrome(cell: {y: number; height: number}, scrollY: number, viewportHeight: number, top: number, bottom: number) {
  const start = scrollY + top, end = scrollY + viewportHeight - bottom;
  if (cell.height <= 0 || end <= start) return false;
  const visible = Math.max(0, Math.min(cell.y + cell.height, end) - Math.max(cell.y, start));
  return visible >= Math.min(cell.height, (end - start) * 0.5);
}

export function MessageList<T extends Message>({data, currentUserId, onReadThrough, occludedTop = 0, occludedBottom = 0, ...props}: Props<T>) {
  const readCallback = useRef(onReadThrough);
  readCallback.current = onReadThrough;
  const chrome = useRef({top: occludedTop, bottom: occludedBottom}); chrome.current = {top: occludedTop, bottom: occludedBottom};
  const viewport = useRef({y: 0, height: 0});
  const frames = useRef(new Map<number, {y: number; height: number}>());
  const candidates = useRef<ViewToken<T>[]>([]);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRead = useRef<() => void>(() => {});
  const visibleId = () => candidates.current.filter(token => {
    if (!token.isViewable) return false;
    if (!chrome.current.top && !chrome.current.bottom) return true;
    const cell = frames.current.get(token.item.id);
    return cell && visibleAboveChrome(cell, viewport.current.y, viewport.current.height, chrome.current.top, chrome.current.bottom);
  }).reduce((id, token) => Math.max(id, token.item.id), 0);
  checkRead.current = () => {
    if (readTimer.current) clearTimeout(readTimer.current);
    const id = visibleId();
    if (!id) return;
    if (!chrome.current.top && !chrome.current.bottom) {readCallback.current?.(id); return;}
    // A native list's viewport includes overlay toolbars. Never acknowledge a
    // message concealed by them; require a stable exposed view before marking read.
    readTimer.current = setTimeout(() => {readTimer.current = null; if (visibleId() === id) readCallback.current?.(id);}, 250);
  };
  const onViewableItemsChanged = useRef(({viewableItems}: {viewableItems: ViewToken<T>[]}) => {
    candidates.current = viewableItems; checkRead.current();
  }).current;
  const Cell = useRef(({item, onLayout, onFocusCapture, style, children}: CellRendererProps<T>) => <View {...{onFocusCapture}} style={style}
    onLayout={event => {frames.current.set(item.id, event.nativeEvent.layout); onLayout?.(event); checkRead.current();}}>{children}</View>).current;
  useLayoutEffect(() => {
    const ids = new Set(data.map(item => item.id));
    for (const id of frames.current.keys()) if (!ids.has(id)) frames.current.delete(id);
    candidates.current = candidates.current.filter(token => ids.has(token.item.id));
    if (occludedTop || occludedBottom) checkRead.current();
    return () => {if (readTimer.current) clearTimeout(readTimer.current);};
  }, [data, occludedTop, occludedBottom]);
  const list = useRef<FlatList<T>>(null);
  const following = useRef(true);
  const dragging = useRef(false);
  const latestId = useRef<number | null>(null);
  const scrollToLatest = () => {
    if (following.current) list.current?.scrollToEnd({animated: false});
  };
  useLayoutEffect(() => {
    const latest = data[data.length - 1];
    following.current = shouldFollowLatest(following.current, latestId.current, latest, currentUserId);
    latestId.current = latest?.id ?? null;
    scrollToLatest();
  }, [data, currentUserId]);
  const trackPosition = ({nativeEvent}: NativeSyntheticEvent<NativeScrollEvent>) => {
    viewport.current = {y: nativeEvent.contentOffset.y, height: nativeEvent.layoutMeasurement.height};
    if (chrome.current.top || chrome.current.bottom) checkRead.current();
    // Ignore programmatic scrolling while following, including initial list
    // measurements; dragging up explicitly switches to reading history.
    if (dragging.current || !following.current) {
      const {contentSize, contentOffset, layoutMeasurement} = nativeEvent;
      following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 72;
    }
  };
  return <FlatList {...props} ref={list} data={data} inverted={false} CellRendererComponent={occludedTop || occludedBottom ? Cell : props.CellRendererComponent}
    onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={readVisibility}
    onContentSizeChange={scrollToLatest} onLayout={event => {if (event) viewport.current.height = event.nativeEvent.layout.height; scrollToLatest();}} scrollEventThrottle={16}
    onScroll={trackPosition}
    onScrollBeginDrag={() => {dragging.current = true;}}
    onScrollEndDrag={event => {trackPosition(event); dragging.current = false;}}
    onMomentumScrollBegin={() => {dragging.current = true;}}
    onMomentumScrollEnd={event => {trackPosition(event); dragging.current = false;}}
  />;
}
