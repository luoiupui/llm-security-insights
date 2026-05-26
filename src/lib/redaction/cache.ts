/**
 * LRU cache for resolver lookups.
 * Simulation-only — in production this is backed by a Supabase storage bucket
 * or Redis to honour Wikidata/GeoNames rate limits.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly capacity: number = 256) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key: K) { return this.map.has(key); }
  size() { return this.map.size; }
  clear() { this.map.clear(); }
}
