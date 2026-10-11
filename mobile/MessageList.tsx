import {useLayoutEffect, useRef} from 'react';
import {FlatList, type FlatListProps, type NativeScrollEvent, type NativeSyntheticEvent, type ViewToken} from 'react-native';

type Message = {id: number; sender: {id: number}};
type Props<T extends Message> = Omit<FlatListProps<T>, 'data' | 'inverted'> & {data: T[]; currentUserId?: number; onReadThrough?: (id: number) => void};
const readVisibility = {viewAreaCoveragePercentThreshold: 50, minimumViewTime: 250};

export function shouldFollowLatest(following: boolean, previousId: number | null, latest: Message | undefined, currentUserId?: number) {
  return following || !!(latest && latest.id !== previousId && latest.sender.id === currentUserId);
}

export function MessageList<T extends Message>({data, currentUserId, onReadThrough, ...props}: Props<T>) {
  const readCallback = useRef(onReadThrough);
  readCallback.current = onReadThrough;
  const onViewableItemsChanged = useRef(({viewableItems}: {viewableItems: ViewToken<T>[]}) => {
    const lastVisible = viewableItems.filter(item => item.isViewable).reduce((id, item) => Math.max(id, item.item.id), 0);
    if (lastVisible) readCallback.current?.(lastVisible);
  }).current;
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
    // Ignore programmatic scrolling while following, including initial list
    // measurements; dragging up explicitly switches to reading history.
    if (dragging.current || !following.current) {
      const {contentSize, contentOffset, layoutMeasurement} = nativeEvent;
      following.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 72;
    }
  };
  return <FlatList {...props} ref={list} data={data} inverted={false}
    onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={readVisibility}
    onContentSizeChange={scrollToLatest} onLayout={scrollToLatest} scrollEventThrottle={16}
    onScroll={trackPosition}
    onScrollBeginDrag={() => {dragging.current = true;}}
    onScrollEndDrag={event => {trackPosition(event); dragging.current = false;}}
    onMomentumScrollBegin={() => {dragging.current = true;}}
    onMomentumScrollEnd={event => {trackPosition(event); dragging.current = false;}}
  />;
}
