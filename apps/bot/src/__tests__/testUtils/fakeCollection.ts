/**
 * Minimal stand-in for discord.js's Collection (which extends Map but also
 * exposes array methods like .map/.filter/.some/.sort). Real Collections
 * have all of this; plain Maps/arrays don't, so tests need this shim.
 */
export function makeFakeCollection<T>(items: T[]) {
  const collection = {
    map: <U>(fn: (item: T) => U): U[] => items.map(fn),
    filter: (fn: (item: T) => boolean) => makeFakeCollection(items.filter(fn)),
    sort: (fn: (a: T, b: T) => number) => makeFakeCollection([...items].sort(fn)),
    some: (fn: (item: T) => boolean): boolean => items.some(fn),
    find: (fn: (item: T) => boolean): T | undefined => items.find(fn),
    get: (id: string): T | undefined => items.find((i) => (i as { id?: string }).id === id),
    has: (id: string): boolean => items.some((i) => (i as { id?: string }).id === id),
    values: () => items.values(),
    get size(): number {
      return items.length;
    },
  };
  return collection;
}
