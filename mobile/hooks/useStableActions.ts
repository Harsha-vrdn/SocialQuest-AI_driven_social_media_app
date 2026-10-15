import { useLayoutEffect, useRef, useState } from 'react';

type Actions = Record<string, (...args: never[]) => unknown>;

/** Keep event props stable without capturing an obsolete session or selection. */
export function useStableActions<T extends Actions>(actions: T): T {
  const current = useRef(actions);
  useLayoutEffect(() => { current.current = actions; });
  const [stable] = useState(() => Object.fromEntries(Object.keys(actions).map(key => [
    key, (...args: never[]) => current.current[key](...args),
  ])) as T);
  return stable;
}
