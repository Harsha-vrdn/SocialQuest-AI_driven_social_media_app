/** Compare JSON API values, including nested participant presence and attachments. */
export function equalData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equalData(a[key], b[key]));
}

/** Reuse unchanged rows and arrays so polling does not invalidate React.memo. */
export function reconcileData<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const keyed = new Map(previous.filter(item => item && typeof item === 'object' && 'id' in item).map(item => [item.id, item]));
    const items = next.map((item, index) => {
      const old = item && typeof item === 'object' && 'id' in item ? keyed.get(item.id) : previous[index];
      return equalData(old, item) ? old : item;
    });
    return (items.length === previous.length && items.every((item, index) => item === previous[index]) ? previous : items) as T;
  }
  return equalData(previous, next) ? previous : next;
}
