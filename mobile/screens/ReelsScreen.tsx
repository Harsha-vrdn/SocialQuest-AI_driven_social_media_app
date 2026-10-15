import {memo, useCallback, useEffect, useRef, useState} from 'react';
import {AppState, FlatList, View, useWindowDimensions, type LayoutChangeEvent, type ViewToken} from 'react-native';
import {Empty} from '../components/Empty';
import {ReelItem} from '../components/ReelItem';
import type {SocialQuestController} from '../hooks/useSocialQuestController';
import {getReelStyles} from '../reelStyles';
import {useTheme} from '../ThemeProvider';
import type {Post} from '../types';

type Props = Pick<SocialQuestController, 'reels' | 'refresh' | 'loadFeed' | 'refreshing' | 'accountLoading' | 'setSelectedUser' | 'toggleLike' | 'openComments' | 'shareResource'> & {
  bottomContentInset: number;
  playbackEnabled: boolean;
};

export const ReelsScreen = memo(function ReelsScreen({reels, refresh, loadFeed, refreshing, accountLoading, setSelectedUser, toggleLike, openComments, shareResource, bottomContentInset, playbackEnabled}: Props) {
  const {theme} = useTheme();
  const styles = getReelStyles(theme);
  const {height: windowHeight} = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const itemHeight = Math.max(1, (viewportHeight ?? windowHeight) - bottomContentInset);
  const list = useRef<FlatList<Post>>(null);
  const [activeReelId, setActiveReelId] = useState<number | null>(null);
  const anchor = useRef({id: reels[0]?.id ?? null, index: 0, height: itemHeight});
  const [focused, setFocused] = useState(AppState.currentState === 'active');
  const viewabilityConfig = useRef({itemVisiblePercentThreshold: 80}).current;
  const onViewableItemsChanged = useCallback(({viewableItems}: {viewableItems: ViewToken<Post>[]}) => {
    const visible = viewableItems.find(token => token.isViewable && token.index !== null);
    setActiveReelId(visible?.item.id ?? null);
    if (visible && visible.index !== null) {
      anchor.current.id = visible.item.id;
      anchor.current.index = visible.index;
    }
  }, []);

  useEffect(() => {
    const change = AppState.addEventListener('change', state => setFocused(state === 'active'));
    const blur = AppState.addEventListener('blur', () => setFocused(false));
    const focus = AppState.addEventListener('focus', () => setFocused(AppState.currentState === 'active'));
    return () => {change.remove(); blur.remove(); focus.remove();};
  }, []);

  // Keep the same reel through rotation and refreshes that insert/remove rows.
  // Count-only polling updates never move the list.
  useEffect(() => {
    const previous = anchor.current;
    const found = reels.findIndex(reel => reel.id === previous.id);
    const index = found >= 0 ? found : Math.max(0, Math.min(previous.index, reels.length - 1));
    const id = reels[index]?.id ?? null;
    if (previous.height !== itemHeight || previous.index !== index || previous.id !== id) {
      list.current?.scrollToOffset({offset: index * itemHeight, animated: false});
      // A resize can leave native viewability unchanged. Retain that confirmed
      // reel, but never transfer playback to an unconfirmed replacement row.
      setActiveReelId(current => current === id ? current : null);
    }
    anchor.current = {id, index, height: itemHeight};
  }, [itemHeight, reels]);

  const measure = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) setViewportHeight(height);
  }, []);

  return <View style={styles.screen} onLayout={measure}>
    <FlatList<Post> ref={list}
      style={[styles.list, {marginBottom: bottomContentInset}]}
      data={reels}
      keyExtractor={item => String(item.id)}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      snapToInterval={itemHeight}
      decelerationRate="fast"
      snapToAlignment="start"
      disableIntervalMomentum
      getItemLayout={(_data, index) => ({length: itemHeight, offset: itemHeight * index, index})}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      extraData={{activeReelId, playbackEnabled, focused, itemHeight}}
      initialNumToRender={1}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews={false}
      onRefresh={() => void refresh(loadFeed)}
      refreshing={refreshing}
      contentContainerStyle={reels.length ? undefined : styles.empty}
      ListEmptyComponent={<Empty loading={accountLoading} icon="◉" title="No reels yet." body="The next great moment could be yours." />}
      renderItem={({item}) => <ReelItem item={item} itemHeight={itemHeight}
        isActive={playbackEnabled && focused && activeReelId === item.id}
        toggleLike={toggleLike} openComments={openComments} shareResource={shareResource} setSelectedUser={setSelectedUser} />}
    />
  </View>;
});
