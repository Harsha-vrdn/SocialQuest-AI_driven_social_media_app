import { useMemo } from 'react';
import type { getAppStyles } from '../appStyles';

/** Floating navigation needs padding inside the scrollable content. */
export function useListContentStyle(styles: ReturnType<typeof getAppStyles>, bottomContentInset: number) {
  return useMemo(() => {
    const mainListContentStyle = [styles.list, { paddingBottom: styles.list.paddingBottom + bottomContentInset }];
    return mainListContentStyle;
  }, [styles, bottomContentInset]);
}
