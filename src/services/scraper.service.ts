import { getAdapter, getOrderedAdapters } from '../adapters/index.js';
import { cache } from './cache.service.js';
import { db } from './db.service.js';
import { config } from '../config.js';
import type {
  ListItem,
  DetailItem,
  ChapterContent,
  GenreItem,
  ProviderName,
} from '../types/index.js';

type Action = 'search' | 'latest' | 'popular' | 'detail' | 'chapter' | 'genres';

export class ScraperService {
  private async withFallback<T>(
    action: Action,
    preferred: ProviderName | undefined,
    fn: (adapter: ReturnType<typeof getAdapter>) => Promise<T>,
    cacheKey?: string,
    ttl?: number
  ): Promise<{ data: T; source: ProviderName | 'unified'; cached: boolean }> {
    if (cacheKey) {
      const hit = await cache.get<{ data: T; source: ProviderName | 'unified' }>(cacheKey);
      if (hit) return { ...hit, cached: true };
    }

    const adapters = getOrderedAdapters(preferred);
    let lastError: Error | null = null;

    for (const adapter of adapters) {
      if (preferred && adapter.name !== preferred) continue; // strict if preferred given? No, still fallback after preferred
      // Actually: try preferred first then others
      const start = Date.now();
      try {
        const data = await fn(adapter);
        const duration = Date.now() - start;
        db.logScrape(adapter.name, action, true, duration).catch(() => {});
        const result = { data, source: adapter.name as ProviderName | 'unified' };
        if (cacheKey && ttl) await cache.set(cacheKey, result, ttl);
        return { ...result, cached: false };
      } catch (e) {
        lastError = e as Error;
        const duration = Date.now() - start;
        db.logScrape(adapter.name, action, false, duration, lastError.message).catch(() => {});
        console.warn(`[scraper] ${adapter.name}.${action} failed:`, lastError.message);
      }
    }

    // If preferred was given and we restricted, retry full order without preferred restriction
    if (preferred) {
      for (const adapter of getOrderedAdapters()) {
        if (adapter.name === preferred) continue;
        const start = Date.now();
        try {
          const data = await fn(adapter);
          const duration = Date.now() - start;
          db.logScrape(adapter.name, action, true, duration).catch(() => {});
          const result = { data, source: adapter.name };
          if (cacheKey && ttl) await cache.set(cacheKey, result, ttl);
          return { ...result, cached: false };
        } catch (e) {
          lastError = e as Error;
          db.logScrape(adapter.name, action, false, Date.now() - start, (e as Error).message).catch(() => {});
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }

  async search(query: string, opts: { page?: number; limit?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const key = `search:${opts.source || 'all'}:${query}:${page}:${limit}`;
    const { data, source, cached } = await this.withFallback(
      'search',
      opts.source,
      (a) => a.search(query, { page, limit }),
      key,
      config.cache.search
    );
    // fire-and-forget persist
    if (!cached && Array.isArray(data)) db.upsertMany(data).catch(() => {});
    return { data, source, cached };
  }

  async latest(opts: { page?: number; type?: string; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const key = `latest:${opts.source || 'all'}:${opts.type || 'all'}:${page}`;
    const { data, source, cached } = await this.withFallback(
      'latest',
      opts.source,
      (a) => a.latest({ page, type: opts.type }),
      key,
      config.cache.latest
    );
    if (!cached && Array.isArray(data)) db.upsertMany(data).catch(() => {});
    return { data, source, cached };
  }

  async popular(opts: { page?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const key = `popular:${opts.source || 'all'}:${page}`;
    const { data, source, cached } = await this.withFallback(
      'popular',
      opts.source,
      (a) => a.popular({ page }),
      key,
      config.cache.popular
    );
    if (!cached && Array.isArray(data)) db.upsertMany(data).catch(() => {});
    return { data, source, cached };
  }

  async detail(source: ProviderName, id: string) {
    // id may already be prefixed
    const key = `detail:${source}:${id}`;
    const { data, source: used, cached } = await this.withFallback(
      'detail',
      source,
      (a) => a.detail(id),
      key,
      config.cache.detail
    );
    if (!cached) db.upsertComic(data as DetailItem).catch(() => {});
    return { data, source: used, cached };
  }

  async chapter(source: ProviderName, seriesId: string, chapterId: string) {
    const key = `chapter:${source}:${seriesId}:${chapterId}`;
    return this.withFallback(
      'chapter',
      source,
      (a) => a.chapter(seriesId, chapterId),
      key,
      config.cache.chapter
    );
  }

  async genres(opts: { source?: ProviderName } = {}) {
    const key = `genres:${opts.source || 'all'}`;
    if (opts.source) {
      return this.withFallback('genres', opts.source, (a) => a.genres?.() ?? Promise.resolve([]), key, config.cache.genres);
    }
    // merge from all
    const cached = await cache.get<{ data: GenreItem[]; source: 'unified' }>(key);
    if (cached) return { ...cached, cached: true };

    const all: GenreItem[] = [];
    const seen = new Set<string>();
    for (const a of getOrderedAdapters()) {
      try {
        const list = await a.genres?.() ?? [];
        for (const g of list) {
          const k = g.slug || g.name.toLowerCase();
          if (!seen.has(k)) {
            seen.add(k);
            all.push(g);
          }
        }
      } catch {
        // continue
      }
    }
    const result = { data: all, source: 'unified' as const };
    await cache.set(key, result, config.cache.genres);
    return { ...result, cached: false };
  }
}

export const scraper = new ScraperService();
