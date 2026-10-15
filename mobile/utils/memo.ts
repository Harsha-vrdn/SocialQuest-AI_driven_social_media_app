/** Compare every prop, including callbacks, so memoization never hides new behavior. */
export function shallowEqualProps<T extends object>(previous: T, next: T): boolean {
  const keys = Object.keys(previous) as (keyof T)[];
  return keys.length === Object.keys(next).length && keys.every(key => Object.prototype.hasOwnProperty.call(next, key) && Object.is(previous[key], next[key]));
}
