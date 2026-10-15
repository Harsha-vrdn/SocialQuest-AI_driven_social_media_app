import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { reconcileData } from '../utils/reconcile';

export function useReconciledState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const update = useCallback<Dispatch<SetStateAction<T>>>(next => {
    setValue(previous => reconcileData(previous, typeof next === 'function' ? (next as (value: T) => T)(previous) : next));
  }, []);
  return [value, update];
}
