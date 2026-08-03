/** Tiny TTL cache for hot taste/vehicle/context snapshots. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();

  constructor(private readonly defaultTtlMs = 30_000) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (Date.now() > hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: V, ttlMs = this.defaultTtlMs): void {
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }
}
