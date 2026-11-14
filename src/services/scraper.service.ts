import { getAdapter, getOrderedAdapters } from '../adapters/index.js';
import type { ProviderAdapter } from '../adapters/index.js';
import { cache } from './cache.service.js';
import { db } from './db.service.js';
import { config } from '../config.js';
import type { DetailItem, GenreItem, ProviderName } from '../types/index.js';

type Action = 'search' | 'latest' | 'popular' | 'detail' | 'chapter' | 'genres';
type Source = ProviderName | 'unified';

interface Outcome<T> {
  data: T;
  source: Source;
  cached: boolean;
}

interface ExecuteOptions {
  action: Action;
  source?: ProviderName;
  strict?: boolean;
  cacheKey: string;
  ttl: number;
}

export class ScraperService {
  private async execute<T>(
    { action, source, strict = false, cacheKey, ttl }: ExecuteOptions,
    run: (adapter: ProviderAdapter) => Promise<T>
  ): Promise<Outcome<T>> {
    const hit = await cache.get<{ data: T; source: Source }>(cacheKey);
    if (hit) return { ...hit, cached: true };

    const adapters = strict && source ? [getAdapter(source)] : getOrderedAdapters(source);
    let lastError: unknown = new Error('All providers failed');

    for (const adapter of adapters) {
      const start = Date.now();
      try {
        const data = await run(adapter);
        db.logScrape(adapter.name, action, true, Date.now() - start);
        const result = { data, source: adapter.name as Source };
        await cache.set(cacheKey, result, ttl);
        return { ...result, cached: false };
      } catch (e) {
        lastError = e;
        const message = (e as Error).message;
        db.logScrape(adapter.name, action, false, Date.now() - start, message);
        console.warn(`[scraper] ${adapter.name}.${action} failed:`, message);
      }
    }

    throw lastError;
  }

  async search(query: string, opts: { page?: number; limit?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const result = await this.execute(
      {
        action: 'search',
        source: opts.source,
        cacheKey: `search:${opts.source || 'all'}:${query.toLowerCase()}:${page}:${limit}`,
        ttl: config.cache.search,
      },
      (adapter) => adapter.search(query, { page, limit })
    );
    if (!result.cached) db.upsertMany(result.data);
    return result;
  }

  async latest(opts: { page?: number; type?: string; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const result = await this.execute(
      {
        action: 'latest',
        source: opts.source,
        cacheKey: `latest:${opts.source || 'all'}:${opts.type || 'all'}:${page}`,
        ttl: config.cache.latest,
      },
      (adapter) => adapter.latest({ page, type: opts.type })
    );
    if (!result.cached) db.upsertMany(result.data);
    return result;
  }

  async popular(opts: { page?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const result = await this.execute(
      {
        action: 'popular',
        source: opts.source,
        cacheKey: `popular:${opts.source || 'all'}:${page}`,
        ttl: config.cache.popular,
      },
      (adapter) => adapter.popular({ page })
    );
    if (!result.cached) db.upsertMany(result.data);
    return result;
  }

  async detail(source: ProviderName, id: string) {
    const result = await this.execute(
      {
        action: 'detail',
        source,
        strict: true,
        cacheKey: `detail:${source}:${id}`,
        ttl: config.cache.detail,
      },
      (adapter) => adapter.detail(id)
    );
    if (!result.cached) db.upsertComic(result.data as DetailItem);
    return result;
  }

  async chapter(source: ProviderName, seriesId: string, chapterId: string) {
    return this.execute(
      {
        action: 'chapter',
        source,
        strict: true,
        cacheKey: `chapter:${source}:${seriesId}:${chapterId}`,
        ttl: config.cache.chapter,
      },
      (adapter) => adapter.chapter(seriesId, chapterId)
    );
  }

  async genres(opts: { source?: ProviderName } = {}) {
    if (opts.source) {
      return this.execute(
        {
          action: 'genres',
          source: opts.source,
          strict: true,
          cacheKey: `genres:${opts.source}`,
          ttl: config.cache.genres,
        },
        async (adapter) => (await adapter.genres?.()) ?? []
      );
    }

    const cacheKey = 'genres:all';
    const hit = await cache.get<{ data: GenreItem[]; source: Source }>(cacheKey);
    if (hit) return { ...hit, cached: true };

    const settled = await Promise.allSettled(
      getOrderedAdapters().map(async (adapter) => (await adapter.genres?.()) ?? [])
    );

    const unique = new Map<string, GenreItem>();
    for (const entry of settled) {
      if (entry.status !== 'fulfilled') continue;
      for (const genre of entry.value) {
        const key = genre.slug || genre.name.toLowerCase();
        if (!unique.has(key)) unique.set(key, genre);
      }
    }

    const result = { data: [...unique.values()], source: 'unified' as Source };
    if (result.data.length) await cache.set(cacheKey, result, config.cache.genres);
    return { ...result, cached: false };
  }
}

export const scraper = new ScraperService();
