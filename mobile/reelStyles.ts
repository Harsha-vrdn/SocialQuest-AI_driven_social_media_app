import {createThemedStyles} from './themedStyles';
import {fonts} from './theme';

// Video overlays use the same high-contrast palette in either app appearance.
export const getReelStyles = createThemedStyles(({colors}) => ({
  screen: {flex: 1, backgroundColor: colors.mediaBackground},
  list: {flex: 1},
  empty: {flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.background},
  page: {width: '100%', overflow: 'hidden', backgroundColor: colors.mediaBackground},
  video: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%'},
  gradient: {position: 'absolute', bottom: 0, left: 0, right: 0, height: '75%'},
  rail: {position: 'absolute', right: 8, bottom: 24, width: 64, alignItems: 'center', gap: 12},
  compactRail: {bottom: 8, gap: 4},
  profileButton: {minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, borderWidth: 2, borderColor: '#FFFFFF'},
  meta: {position: 'absolute', left: 16, right: 88, bottom: 24, gap: 8},
  compactMeta: {bottom: 8, gap: 4},
  author: {flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 44},
  username: {flex: 1, fontFamily: fonts.bold, color: '#FFFFFF', fontSize: 16, lineHeight: 22},
  caption: {fontFamily: fonts.copy, color: '#FFFFFF', fontSize: 15, lineHeight: 22},
  captionMeasure: {position: 'absolute', left: 0, right: 0, top: 0, opacity: 0},
  moreButton: {alignSelf: 'flex-start', minWidth: 44, minHeight: 44, justifyContent: 'center'},
  moreText: {fontFamily: fonts.bold, color: '#FFFFFF', fontSize: 13, lineHeight: 18},
  timestamp: {color: '#FFFFFF', marginTop: 0},
  center: {position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center'},
  feedback: {width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center'},
  heart: {position: 'absolute', width: 96, height: 96, alignItems: 'center', justifyContent: 'center'},
  loading: {gap: 12},
  statusText: {fontFamily: fonts.copy, color: '#FFFFFF', fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 24},
}));
