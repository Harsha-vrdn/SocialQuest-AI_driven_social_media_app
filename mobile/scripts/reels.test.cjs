const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({type, props, key});
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX},
  }).outputText;
  const context = {exports: {}, ...globals, require: name => {
    if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx};
    assert.ok(name in imports, 'Mock supplied for ' + name);
    return imports[name];
  }};
  vm.runInNewContext(code, context);
  return context.exports;
}

// Run the real hooks with controlled native events and React effect cleanup.
function hooks() {
  const slots = [], pending = [];
  let cursor = 0, dirty = true, value;
  const memo = (factory, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) slots[index] = {value: factory(), deps};
    return slots[index].value;
  };
  const effect = phase => (run, deps) => {
    const index = cursor++, previous = slots[index];
    if (!previous || !deps || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
      const slot = slots[index] = {deps, phase}; pending.push({slot, run, previous});
    }
  };
  const react = {
    memo: component => component, useMemo: memo, useCallback: (callback, deps) => memo(() => callback, deps),
    useRef: initial => memo(() => ({current: initial}), []),
    useState: initial => {
      const state = memo(() => {
        const slot = {value: typeof initial === 'function' ? initial() : initial};
        slot.set = update => {
          const next = typeof update === 'function' ? update(slot.value) : update;
          if (!Object.is(next, slot.value)) {slot.value = next; dirty = true;}
        };
        return slot;
      }, []);
      return [state.value, state.set];
    },
    useLayoutEffect: effect(0), useEffect: effect(1),
  };
  return {react, render: callback => {
    dirty = true; let iterations = 0;
    while (dirty) {
      assert.ok(++iterations < 20, 'Effects settle without a render loop');
      dirty = false; cursor = 0; value = callback();
      const effects = pending.splice(0).sort((a, b) => a.slot.phase - b.slot.phase);
      for (const {previous} of effects) previous?.cleanup?.();
      for (const {slot, run} of effects) slot.cleanup = run();
    }
    return value;
  }, unmount: () => slots.filter(slot => slot?.cleanup).sort((a, b) => a.phase - b.phase).forEach(slot => slot.cleanup())};
}

const theme = load('theme.ts');
const styleImports = {'./themedStyles': {createThemedStyles: factory => factory}, './theme': theme};
const reelStyles = load('reelStyles.ts', styleImports);
const appStyles = load('appStyles.ts', styleImports);
const makePost = id => ({id, kind: 'REEL', body: 'A community moment.', media: '/reel-' + id + '.mp4',
  author: {id: 4, username: 'maya'}, created_at: '2026-10-15T00:00:00Z', like_count: 5, comment_count: 2, liked_by_me: false});

function screenHarness({bottomContentInset = 80, reels = [makePost(1), makePost(2)]} = {}) {
  const h = hooks(), listeners = new Map(), scrolls = [];
  const appState = {currentState: 'active', addEventListener: (name, run) => {
    listeners.set(name, run); return {remove: () => listeners.delete(name)};
  }};
  const {ReelsScreen} = load('screens/ReelsScreen.tsx', {
    react: h.react, 'react-native': {AppState: appState, FlatList: 'List', View: 'View', useWindowDimensions: () => ({height: 844})},
    '../components/Empty': {Empty: 'Empty'}, '../components/ReelItem': {ReelItem: 'ReelItem'},
    '../reelStyles': reelStyles, '../ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})},
  });
  const props = {reels, bottomContentInset, playbackEnabled: true, accountLoading: false, refreshing: false,
    refresh: run => run(), loadFeed() {}, setSelectedUser() {}, toggleLike() {}, openComments() {}, shareResource() {}};
  let tree;
  const render = () => {
    tree = h.render(() => ReelsScreen(props));
    tree.props.children.props.ref.current = {scrollToOffset: options => scrolls.push(options)};
  };
  render();
  const list = () => tree.props.children.props;
  return {props, render, list, scrolls, unmount: h.unmount, listeners,
    measure: height => {tree.props.onLayout({nativeEvent: {layout: {height}}}); render();},
    visible: index => {
      list().onViewableItemsChanged({viewableItems: index === null ? [] : [{isViewable: true, index, item: props.reels[index]}]}); render();
    },
    active: () => props.reels.filter((item, index) => list().renderItem({item, index}).props.isActive).map(item => item.id),
    event: (name, state) => {if (state) appState.currentState = state; listeners.get(name)?.(appState.currentState); render();},
  };
}

function playbackHarness() {
  const h = hooks(), calls = [];
  const events = load('node_modules/expo/src/hooks/useEvent.ts', {react: h.react});
  const listeners = new Map();
  const player = {status: 'loading', playing: false, released: false,
    play() {assert.equal(this.released, false); this.playing = true; calls.push('play');},
    pause() {assert.equal(this.released, false); this.playing = false; calls.push('pause');},
    addListener(name, run) {listeners.set(name, run); return {remove: () => listeners.delete(name)};},
  };
  const useVideoPlayer = (source, setup) => {
    h.react.useMemo(() => {setup(player);}, [source]);
    h.react.useEffect(() => () => {player.released = true;}, []);
    return player;
  };
  const {useReelPlayback} = load('hooks/useReelPlayback.ts', {react: h.react, expo: events, 'expo-video': {useVideoPlayer}});
  const props = {isActive: false, media: '/reel.mp4'};
  let value;
  const render = () => value = h.render(() => useReelPlayback(props.media, props.isActive));
  render();
  return {props, player, calls, render, value: () => value, unmount: h.unmount, listeners,
    status: status => {player.status = status; listeners.get('statusChange')({status}); render();},
  };
}

test('reel pages fill the measured viewport and snap without feed padding or headers', () => {
  for (const bottomContentInset of [0, 80, 120]) {
    const screen = screenHarness({bottomContentInset}); screen.measure(700);
    const list = screen.list(), height = 700 - bottomContentInset;
    assert.equal(list.pagingEnabled, true); assert.equal(list.showsVerticalScrollIndicator, false);
    assert.equal(list.snapToInterval, height); assert.equal(list.snapToAlignment, 'start'); assert.equal(list.decelerationRate, 'fast');
    assert.equal(list.ListHeaderComponent, undefined); assert.equal(list.contentContainerStyle, undefined);
    assert.equal(list.getItemLayout(null, 2).offset, height * 2);
    assert.equal(list.renderItem({item: makePost(1), index: 0}).props.itemHeight, height);
    assert.equal(list.viewabilityConfig.itemVisiblePercentThreshold, 80);
    const callback = list.onViewableItemsChanged, config = list.viewabilityConfig;
    screen.visible(0); screen.visible(null);
    assert.equal(screen.list().onViewableItemsChanged, callback); assert.equal(screen.list().viewabilityConfig, config);
    screen.unmount(); assert.equal(screen.listeners.size, 0);
  }
});

test('only visible reels are active; background, Android blur and modal coverage stop playback', () => {
  const screen = screenHarness(); screen.measure(700); assert.deepEqual(screen.active(), []);
  screen.visible(0); assert.deepEqual(screen.active(), [1]);
  screen.visible(null); assert.deepEqual(screen.active(), []);
  screen.visible(1); assert.deepEqual(screen.active(), [2]);
  screen.event('change', 'background'); assert.deepEqual(screen.active(), []);
  screen.event('focus'); assert.deepEqual(screen.active(), []);
  screen.event('change', 'active'); assert.deepEqual(screen.active(), [2]);
  screen.event('blur'); assert.deepEqual(screen.active(), []);
  screen.event('focus'); assert.deepEqual(screen.active(), [2]);
  screen.props.playbackEnabled = false; screen.render(); assert.deepEqual(screen.active(), []);
  screen.props.playbackEnabled = true; screen.render(); assert.deepEqual(screen.active(), [2]);
});

test('rotation and reordered refreshes preserve the current reel; count polls do not scroll', () => {
  const screen = screenHarness(); screen.measure(700); screen.visible(1);
  screen.scrolls.splice(0); screen.measure(500);
  assert.equal(screen.list().snapToInterval, 420); assert.equal(screen.scrolls.at(-1).offset, 420);
  assert.deepEqual(screen.active(), [2], 'An unchanged viewability callback must not leave the resized reel paused');
  screen.props.reels = [makePost(3), ...screen.props.reels]; screen.render();
  assert.equal(screen.scrolls.at(-1).offset, 840); assert.deepEqual(screen.active(), [2]);
  screen.scrolls.splice(0);
  screen.props.reels = screen.props.reels.map(post => ({...post, like_count: 9})); screen.render();
  assert.equal(screen.scrolls.length, 0); assert.deepEqual(screen.active(), [2]);
  screen.props.reels = [makePost(3), makePost(1)]; screen.render();
  assert.deepEqual(screen.active(), []); screen.visible(1); assert.deepEqual(screen.active(), [1]);
});

test('empty and loading feeds retain their existing placeholder and refresh control', () => {
  const screen = screenHarness({reels: []});
  assert.equal(screen.list().ListEmptyComponent.props.title, 'No reels yet.');
  screen.props.accountLoading = true; screen.render(); assert.equal(screen.list().ListEmptyComponent.props.loading, true);
  let refreshed = false;
  screen.props.loadFeed = () => {refreshed = true;}; screen.render(); screen.list().onRefresh();
  assert.equal(refreshed, true); assert.ok(screen.list().contentContainerStyle.flexGrow);
});

test('only the active native player plays, with looping, buffering and cleanup before release', () => {
  const first = playbackHarness(), second = playbackHarness();
  assert.equal(first.player.loop, true); assert.equal(first.player.muted, true); assert.equal(first.player.playing, false);
  assert.equal(first.player.staysActiveInBackground, false); assert.equal(first.value().loading, false);
  first.props.isActive = true; first.render();
  assert.equal(first.player.playing, true); assert.equal(first.player.muted, false); assert.equal(first.value().loading, true);
  first.status('readyToPlay'); assert.equal(first.value().loading, true);
  first.value().onFirstFrameRender(); first.render(); assert.equal(first.value().loading, false);
  first.status('loading'); assert.equal(first.value().loading, true);
  first.props.isActive = false; first.render(); second.props.isActive = true; second.render();
  assert.equal(first.player.playing, false); assert.equal(first.player.muted, true); assert.equal(second.player.playing, true);
  second.unmount(); assert.equal(second.player.playing, false); assert.equal(second.player.muted, true);
  assert.equal(second.player.released, true); assert.equal(second.listeners.size, 0);
});

test('manual pause survives buffering and interruptions; inactive or missing videos cannot be started', () => {
  const reel = playbackHarness(); assert.equal(reel.value().togglePlayback(), null);
  reel.props.isActive = true; reel.render(); assert.equal(reel.player.playing, true);
  assert.equal(reel.value().togglePlayback(), true); reel.render(); assert.equal(reel.player.playing, false);
  reel.status('loading'); reel.status('readyToPlay'); assert.equal(reel.player.playing, false);
  reel.props.isActive = false; reel.render(); reel.props.isActive = true; reel.render(); assert.equal(reel.player.playing, false);
  assert.equal(reel.value().togglePlayback(), false); reel.render(); assert.equal(reel.player.playing, true);
  reel.status('error'); assert.equal(reel.value().loading, false);
  reel.props.media = undefined; reel.render(); assert.equal(reel.player.playing, false); assert.equal(reel.value().togglePlayback(), null);
});

function find(tree, predicate) {
  let match;
  const visit = node => {if (predicate(node)) match ??= node; if (!match) ts.forEachChild(node, visit);};
  visit(tree); assert.ok(match, 'Source element exists'); return match;
}

function slideHarness() {
  const h = hooks(), timers = new Map(), calls = [];
  let nextTimer = 0, tree;
  const {ReelItem} = load('components/ReelItem.tsx', {
    react: h.react, 'react-native': {ActivityIndicator: 'Spinner', ScrollView: 'Scroll', Text: 'Text', View: 'View',
      Animated: {Value: class {stopAnimation() {} setValue() {}}, View: 'Animated'}, StyleSheet: {absoluteFill: {position: 'absolute'}}},
    '@expo/vector-icons': {Ionicons: 'Icon'}, 'expo-linear-gradient': {LinearGradient: 'Gradient'}, 'expo-video': {VideoView: 'Video'},
    '../hooks/useReelPlayback': {useReelPlayback: () => ({player: {}, status: 'readyToPlay', isPlaying: true, paused: false,
      loading: false, onFirstFrameRender() {}, togglePlayback: () => {calls.push('toggle'); return true;}})},
    '../Motion': {SoftPressable: 'Pressable', LikeFeedback: 'HeartBurst', useReducedMotion: () => true},
    '../PostTime': {RelativeTime: 'Time'}, '../QuestAttribution': {QuestAttribution: 'Quest'}, '../ReelActions': {ReelActions: 'Actions'},
    '../reelStyles': reelStyles, '../ThemeProvider': {useTheme: () => ({theme: theme.themes.dark})},
    '../utils/memo': {shallowEqualProps() {}}, '../utils/social': {nameOf: user => user.username}, './Avatar': {Avatar: 'Avatar'},
  }, {setTimeout: run => {timers.set(++nextTimer, run); return nextTimer;}, clearTimeout: id => timers.delete(id)});
  const props = {item: makePost(1), itemHeight: 640, isActive: true,
    toggleLike: item => calls.push(['like', item.id]), openComments: item => calls.push(['comments', item.id]),
    shareResource: (...args) => calls.push(['share', ...args]), setSelectedUser: user => calls.push(['profile', user.id])};
  const render = () => {
    const element = ReelItem(props); tree = h.render(() => element.type(element.props));
  };
  render();
  const nodes = predicate => {
    const found = [];
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (predicate(node)) found.push(node);
      visit(node.props?.children);
    };
    visit(tree); return found;
  };
  return {props, render, nodes, calls, timers, unmount: h.unmount,
    key: () => ReelItem(props).key,
    press: label => nodes(node => node.props?.accessibilityLabel === label)[0].props.onPress({nativeEvent: {locationX: 100, locationY: 200}})};
}

const itemSource = fs.readFileSync(path.join(root, 'components/ReelItem.tsx'), 'utf8');
const itemTree = ts.createSourceFile('ReelItem.tsx', itemSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test('single taps toggle after the double-tap window; double taps like once without toggling playback', () => {
  const handler = find(itemTree, node => ts.isVariableDeclaration(node) && node.name.getText(itemTree) === 'handleVideoPress').initializer;
  const code = ts.transpileModule('(' + handler.getText(itemTree) + ')', {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  for (const liked of [false, true]) {
    const timers = new Map(), likes = [], bursts = [], toggles = [];
    let id = 0;
    const item = {...makePost(1), liked_by_me: liked};
    const context = {item, isActive: true, itemHeight: 640, width: {current: 390}, sequence: {current: 0},
      tapTimer: {current: null}, heartTimer: {current: null}, feedbackTimer: {current: null},
      toggleLike: post => likes.push(post.id), setHeartBurst: burst => bursts.push(burst),
      togglePlayback: () => {toggles.push('toggle'); return true;}, setFeedback() {}, reduced: true,
      feedbackOpacity: {stopAnimation() {}, setValue() {}},
      setTimeout: (run, delay) => {timers.set(++id, {run, delay}); return id;}, clearTimeout: key => timers.delete(key)};
    const press = vm.runInNewContext(code, context), event = {nativeEvent: {locationX: 210, locationY: 180}};
    press(event); assert.deepEqual(toggles, []); assert.equal([...timers.values()][0].delay, 230);
    press(event); assert.deepEqual(likes, liked ? [] : [1]); assert.deepEqual(toggles, []);
    assert.equal(bursts[0].x, 210); assert.equal(bursts[0].y, 180);
    press(event); timers.get(context.tapTimer.current).run(); assert.deepEqual(toggles, ['toggle']);
  }
});

test('overlay rails preserve counts, selected state and accessible touch targets in both themes', () => {
  for (const scheme of ['light', 'dark']) for (const compact of [false, true]) {
    const {ReelActions} = load('ReelActions.tsx', {
      'react-native': {Text: 'Text', View: 'View'}, '@expo/vector-icons': {Ionicons: 'Icon'},
      './Motion': {SoftPressable: 'Pressable', Pop: 'Pop'}, './ThemeProvider': {useTheme: () => ({theme: theme.themes[scheme]})}, './appStyles': appStyles,
    });
    const tree = ReelActions({vertical: true, compact, liked: true, likes: 12, comments: 3, onLike() {}, onComments() {}, onShare() {}});
    assert.equal(tree.props.children.length, 3);
    for (const child of tree.props.children) {
      assert.ok(child.props.style.minHeight >= 44); assert.ok(child.props.style.minWidth >= 44);
      assert.equal(child.props.accessibilityRole, 'button'); assert.ok(child.props.accessibilityLabel);
    }
    assert.equal(tree.props.children[0].props.accessibilityState.selected, true);
    assert.equal(tree.props.children[1].props.accessibilityValue.text, '3 comments');
  }
  const video = find(itemTree, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(itemTree) === 'VideoView');
  assert.match(video.getText(itemTree), /contentFit="cover"/); assert.match(video.getText(itemTree), /surfaceType="textureView"/);
  assert.equal(reelStyles.getReelStyles(theme.themes.light).video.height, '100%');
  assert.equal(reelStyles.getReelStyles(theme.themes.dark).video.width, '100%');
});

test('pending video taps are canceled on deactivation and unmount, and new media resets slide identity', () => {
  const reel = slideHarness(), firstKey = reel.key();
  reel.press('Pause reel'); assert.equal(reel.timers.size, 1);
  reel.props.isActive = false; reel.render(); assert.equal(reel.timers.size, 0); assert.deepEqual(reel.calls, []);
  reel.props.isActive = true; reel.render(); reel.press('Pause reel'); reel.unmount();
  assert.equal(reel.timers.size, 0); assert.deepEqual(reel.calls, []);
  reel.props.item = {...reel.props.item, media: '/replacement.mp4'}; assert.notEqual(reel.key(), firstKey);
});

test('truncated captions expand into a bounded scroll area while attribution and action callbacks remain intact', () => {
  const reel = slideHarness();
  reel.nodes(node => !!node.props?.onTextLayout)[0].props.onTextLayout({nativeEvent: {lines: [{}, {}, {}, {}]}}); reel.render();
  reel.press('Show full reel caption'); reel.render();
  const expanded = reel.nodes(node => node.type === 'Scroll');
  assert.equal(expanded.length, 1); assert.equal(expanded[0].props.style.maxHeight, 640 * 0.35);
  reel.press('Collapse reel caption'); reel.render(); assert.equal(reel.nodes(node => node.type === 'Scroll').length, 0);
  assert.equal(reel.nodes(node => node.type === 'Quest')[0].props.overlay, true);
  const actions = reel.nodes(node => node.type === 'Actions')[0].props;
  actions.onLike(); actions.onComments(); actions.onShare(); reel.press("View maya's profile");
  assert.deepEqual(reel.calls, [['like', 1], ['comments', 1],
    ['share', 'A SocialQuest reel', 'Come see this community reel on SocialQuest.', '/s/post/1/'], ['profile', 4]]);
});

test('the shell disables reels underneath every modal that can cover them', () => {
  const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reel = find(tree, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'ReelsScreen');
  const enabled = reel.attributes.properties.find(prop => prop.name?.getText(tree) === 'playbackEnabled').initializer.expression.getText(tree);
  const state = {appActive: true, commentPost: null, selectedUser: null, peoplePanel: null, composeOpen: false,
    editingPost: null, selectedEvent: null, eventEditor: false, eventEditorClosing: false, profileEditorOpen: false};
  assert.equal(vm.runInNewContext(enabled, state), true);
  for (const key of Object.keys(state)) {
    assert.equal(vm.runInNewContext(enabled, {...state, [key]: key === 'appActive' ? false : true}), false, key + ' stops playback');
  }
});
