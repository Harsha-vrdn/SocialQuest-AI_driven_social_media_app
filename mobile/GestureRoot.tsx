import type {PropsWithChildren} from 'react';

// Metro selects GestureRoot.android for the native Android gesture surfaces.
export function GestureRoot({children}: PropsWithChildren) {
  return <>{children}</>;
}
