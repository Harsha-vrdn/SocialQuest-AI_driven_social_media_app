import {useTheme} from './ThemeProvider';
import {createThemedStyles} from './themedStyles';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {ActivityIndicator, FlatList, Keyboard, Text, TextInput, useWindowDimensions, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {SoftPressable as Pressable, makeRevealCell} from './Motion';
import {fonts} from './theme';

export type SearchKind = 'events' | 'people';
const SearchCell = makeRevealCell('search');
type Item = {id: number};
type Results<T> = {key: string; items: T[]; count: number; page: number; more: boolean};

export function DiscoverSearch<E extends Item, U extends Item>({api, query, onQuery, kind, onKind, focusRequest, refreshKey, nearbyEvents, onNearby, onHost, renderEvent, renderPerson}: {
  api: (path: string, options?: any) => Promise<any>;
  query: string; onQuery: (value: string) => void;
  kind: SearchKind; onKind: (value: SearchKind) => void; focusRequest: number; refreshKey: unknown;
  nearbyEvents: E[] | null; onNearby: () => void; onHost: () => void;
  renderEvent: (event: E) => ReactNode; renderPerson: (person: U) => ReactNode;
}) {
  const {theme} = useTheme();
  const {colors} = theme;
  const styles = getStyles(theme);
  const {width} = useWindowDimensions();
  const input = useRef<TextInput>(null);
  const apiRef = useRef(api); apiRef.current = api;
  const requestVersion = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [results, setResults] = useState<Results<E | U>>({key: '', items: [], count: 0, page: 0, more: false});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const term = query.trim();
  const nearby = !term && kind === 'events' && nearbyEvents !== null;
  const key = JSON.stringify([kind, term, nearby]);
  // Hide results immediately on a query/tab change, before the debounce fires.
  const current = results.key === key;
  const items = current ? results.items : [];

  useEffect(() => { if (focusRequest) input.current?.focus(); }, [focusRequest]);

  const requestSearch = async (page: number, version: number) => {
    inFlight.current = true; setLoading(true); setError('');
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const suffix = '?q=' + encodeURIComponent(term) + '&page=' + page;
      const path = kind === 'events' && !term ? '/events/recommended/' : '/' + kind + '/' + suffix;
      const data = nearby ? nearbyEvents : await apiRef.current(path, {singlePage: true, signal: controller.current.signal});
      if (requestVersion.current !== version) return;
      const found = Array.isArray(data) ? data : data?.results || [];
      setResults(previous => ({key, items: page > 1 && previous.key === key ? [...previous.items, ...found] : found,
        count: data?.count ?? found.length, page, more: Boolean(data?.next)}));
    } catch (failure: any) {
      if (requestVersion.current === version) setError(failure.message || 'Search is unavailable. Try again.');
    } finally {
      if (requestVersion.current === version) { setLoading(false); inFlight.current = false; }
    }
  };

  useEffect(() => {
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    const timer = setTimeout(() => void requestSearch(1, version), term ? 300 : 0);
    return () => { clearTimeout(timer); requestVersion.current += 1; controller.current?.abort(); inFlight.current = false; };
  }, [key, refresh, refreshKey, nearbyEvents]);

  const submit = () => { Keyboard.dismiss(); setRefresh(value => value + 1); };
  const loadMore = () => {
    if (!inFlight.current && current && results.more) void requestSearch(results.page + 1, ++requestVersion.current);
  };
  const noun = kind === 'events' ? 'events' : 'people';
  const countLabel = results.count === 1 ? kind === 'events' ? 'event' : 'person' : noun;
  const waiting = loading || !current && !error;

  return <View style={styles.screen}>
    <View style={styles.controls}>
      <Text style={styles.eyebrow}>DISCOVER YOUR COMMUNITY</Text>
      <Text style={[styles.title, width < 360 && styles.compactTitle]}>Find your people.<Text style={styles.spark}> ✦</Text></Text>
      <View style={styles.searchField}>
        <Ionicons name="search-outline" size={21} color={colors.muted} />
        <TextInput ref={input} accessibilityLabel="Search events or people" style={styles.input} placeholder="Names, places, @people" placeholderTextColor={colors.muted}
          value={query} onChangeText={onQuery} maxLength={100} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={submit} />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" style={styles.clear} onPress={() => { onQuery(''); input.current?.focus(); }}><Ionicons name="close-circle" size={21} color={colors.muted} /></Pressable> : null}
      </View>
      <Text style={styles.hint}>Search by name, place or host. Small typos are okay.</Text>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {(['events', 'people'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'events' ? 'Events' : 'People'} accessibilityState={{selected: kind === value}}
          onPress={() => onKind(value)} style={[styles.tab, kind === value && styles.activeTab]}>
          <Ionicons name={value === 'events' ? 'calendar-outline' : 'people-outline'} size={18} color={kind === value ? colors.accent : colors.muted} />
          <Text style={[styles.tabText, kind === value && styles.activeText]}>{value === 'events' ? 'Events' : 'People'}</Text>
        </Pressable>)}
      </View>
    </View>
    <FlatList<E | U> key={kind} data={items} CellRendererComponent={SearchCell} keyExtractor={item => String(item.id)} contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      onRefresh={() => setRefresh(value => value + 1)} refreshing={loading && current && results.page <= 1}
      ListHeaderComponent={<View style={styles.resultsHeader}>
        {kind === 'events' && !term ? <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onNearby} style={[styles.action, nearby && styles.activeTab]}><Ionicons name="navigate-outline" size={16} color={colors.accent} /><Text style={styles.actionText}>{nearby ? 'Near you' : 'Near me'}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onHost} style={styles.action}><Ionicons name="add-outline" size={18} color={colors.accent} /><Text style={styles.actionText}>Host an event</Text></Pressable>
        </View> : null}
        <Text accessibilityLiveRegion="polite" style={styles.summary}>{waiting && !items.length ? 'Searching…' : error && !items.length ? 'Search unavailable' : term ? `${current ? results.count : 0} ${countLabel} · Best matches first` : kind === 'events' ? nearby ? 'EVENTS NEAR YOU' : 'RECOMMENDED FOR YOU' : 'MEET THE COMMUNITY'}</Text>
      </View>}
      renderItem={({item}) => <>{kind === 'events' ? renderEvent(item as E) : renderPerson(item as U)}</>}
      ListEmptyComponent={<View style={styles.empty}>{waiting ? <ActivityIndicator accessibilityLabel="Searching" color={colors.accent} /> : <>
        <Ionicons name={error ? 'cloud-offline-outline' : 'search-outline'} size={32} color={colors.muted} />
        <Text style={styles.emptyTitle}>{error ? 'Could not load results' : term ? `No matching ${noun}` : `No ${noun} yet`}</Text>
        <Text style={styles.emptyBody}>{error || (kind === 'events' ? 'Try an event name, place, or host.' : 'Try a name, @username, or city.')}</Text>
      </>}</View>}
      ListFooterComponent={error ? <View>{items.length ? <Text accessibilityRole="alert" style={styles.emptyBody}>{error}</Text> : null}<Pressable accessibilityRole="button" style={styles.more} onPress={() => items.length ? loadMore() : setRefresh(value => value + 1)}><Text style={styles.actionText}>Try again</Text></Pressable></View>
        : current && results.more ? <Pressable accessibilityRole="button" accessibilityState={{disabled: loading}} disabled={loading} style={styles.more} onPress={loadMore}>{loading ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.actionText}>Load more {noun}</Text>}</Pressable> : null} />
  </View>;
}

const getStyles = createThemedStyles(({colors}) => ({
  screen: {flex: 1}, controls: {paddingHorizontal: 20, paddingTop: 18, gap: 12},
  eyebrow: {fontFamily: fonts.copy, color: colors.accent, fontSize: 10, lineHeight: 16, letterSpacing: 1},
  title: {fontFamily: fonts.heading, color: colors.text, fontSize: 25, lineHeight: 34}, spark: {color: colors.rose},
  compactTitle: {fontSize: 22, lineHeight: 30},
  searchField: {flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderBright, backgroundColor: colors.field, borderRadius: 12, paddingLeft: 12, minHeight: 52, gap: 8},
  input: {fontFamily: fonts.copy, color: colors.text, flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 12, paddingRight: 8, fontSize: 14, lineHeight: 22},
  clear: {width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center'},
  hint: {fontFamily: fonts.copy, color: colors.muted, fontSize: 11, lineHeight: 17},
  tabs: {flexDirection: 'row', gap: 8, paddingBottom: 4},
  tab: {flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, padding: 12, minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10},
  activeTab: {backgroundColor: colors.selection, borderColor: colors.accent},
  tabText: {fontFamily: fonts.copy, fontSize: 14, color: colors.muted}, activeText: {color: colors.accent},
  results: {paddingHorizontal: 20, paddingBottom: 24, gap: 12}, resultsHeader: {gap: 16, paddingTop: 12, paddingBottom: 4},
  summary: {fontFamily: fonts.copy, fontSize: 11, lineHeight: 18, color: colors.muted},
  actions: {flexDirection: 'row', gap: 8}, action: {flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 44, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface},
  actionText: {fontFamily: fonts.copy, fontSize: 12, lineHeight: 18, color: colors.accent},
  empty: {alignItems: 'center', gap: 12, paddingVertical: 32, paddingHorizontal: 12},
  emptyTitle: {fontFamily: fonts.copy, fontSize: 17, lineHeight: 24, textAlign: 'center', color: colors.text},
  emptyBody: {fontFamily: fonts.copy, fontSize: 12, lineHeight: 20, textAlign: 'center', color: colors.muted},
  more: {alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: 12, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border},
}));
