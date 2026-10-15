export type SwipeAxis = 'x' | 'y';

// Decide once after the touch slop: a scroll or diagonal drag must not become
// navigation halfway through a gesture.
export function swipeIntent(dx: number, dy: number, axis: SwipeAxis) {
  'worklet';
  if (Math.hypot(dx, dy) < 12) return 'pending';
  const along = axis === 'x' ? dx : dy, across = axis === 'x' ? dy : dx;
  return along > Math.abs(across) * 1.6 ? 'accept' : 'reject';
}

export function shouldDismissSwipe(distance: number, across: number, velocity: number, threshold = 96) {
  'worklet';
  return distance > Math.abs(across) * 1.6 && velocity >= -0.1
    && (distance >= threshold || (distance >= 36 && velocity >= 0.65));
}
