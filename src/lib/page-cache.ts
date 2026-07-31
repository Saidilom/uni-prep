// In-memory session cache with TTL and in-flight deduplication.
// Survives client-side navigation; cleared on hard refresh.

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const pageCache = {
    get<T>(key: string): T | undefined {
        const entry = cache.get(key) as CacheEntry<T> | undefined;
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) { cache.delete(key); return undefined; }
        return entry.data;
    },

    set<T>(key: string, data: T, ttlMs = 5 * 60 * 1000): void {
        cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    },

    has(key: string): boolean {
        const entry = cache.get(key);
        if (!entry) return false;
        if (Date.now() > (entry as CacheEntry<unknown>).expiresAt) { cache.delete(key); return false; }
        return true;
    },

    /**
     * Fetch with cache + in-flight deduplication.
     * If the same key is already being fetched, returns the same promise — no duplicate Firestore calls.
     */
    async fetch<T>(key: string, fetcher: () => Promise<T>, ttlMs = 5 * 60 * 1000): Promise<T> {
        const cached = this.get<T>(key);
        if (cached !== undefined) return cached;

        const existing = inflight.get(key);
        if (existing) return existing as Promise<T>;

        const promise = fetcher()
            .then((data) => {
                this.set(key, data, ttlMs);
                inflight.delete(key);
                return data;
            })
            .catch((err) => {
                inflight.delete(key);
                throw err;
            });

        inflight.set(key, promise);
        return promise;
    },

    invalidate(key: string): void {
        cache.delete(key);
    },

    invalidatePrefix(prefix: string): void {
        Array.from(cache.keys()).forEach((key) => {
            if (key.startsWith(prefix)) cache.delete(key);
        });
    },

    clear(): void {
        cache.clear();
        inflight.clear();
    },
};
