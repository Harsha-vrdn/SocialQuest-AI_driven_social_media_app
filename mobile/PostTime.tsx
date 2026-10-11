import {createContext, useContext, useEffect, useState, type PropsWithChildren} from 'react';
import {AppState, Text} from 'react-native';
import {relativeTime} from './relativeTime';
import {getAppStyles} from './appStyles';
import {useTheme} from './ThemeProvider';

const Now = createContext(Date.now());
export function RelativeTimeProvider({children}: PropsWithChildren) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      if (timer) clearInterval(timer);
      if (AppState.currentState !== 'active') return;
      setNow(Date.now());
      timer = setInterval(() => setNow(Date.now()), 30000);
    };
    update();
    const subscription = AppState.addEventListener('change', update);
    return () => { if (timer) clearInterval(timer); subscription.remove(); };
  }, []);
  return <Now.Provider value={now}>{children}</Now.Provider>;
}

export function RelativeTime({value}: {value: string}) {
  const {theme} = useTheme();
  const styles = getAppStyles(theme);
  const label = relativeTime(value, useContext(Now));
  if (!label) return null;
  return <Text style={styles.personMeta} accessibilityLabel={`Posted ${new Date(value).toLocaleString()}`}>{label}</Text>;
}
