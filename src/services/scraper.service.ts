import { getAdapter, getOrderedAdapters } from '../adapters/index.js';
import type { ProviderAdapter } from '../adapters/index.js';
import { cache } from './cache.service.js';
import { db } from './db.service.js';
import { config } from '../config.js';
import { toSlug } from '../utils/slug.js';
import { mergeItems } from '../utils/merge.js';
import type { DetailItem, GenreItem, ListItem, ProviderName } from '../types/index.js';

type Action = 'search' | 'latest' | 'popular' | 'browse' | 'detail' | 'chapter' | 'genres' | 'types';
type Source = ProviderName | 'unified';
type ProviderStatus = 'ok' | 'empty' | 'error';

interface Outcome<T> {
  data: T;
  source: Source;
  cached: boolean;
  providers?: Record<string, ProviderStatus>;
}

interface ExecuteOptions {
  action: Action;
  source?: ProviderName;
  strict?: boolean;
  page?: number;
  cacheKey: string;
  ttl: number;
}

interface AggregateOptions {
  action: Action;
  cacheKey: string;
  ttl: number;
  adapters?: ProviderAdapter[];
}

function isEmpty(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

function matches(item: ListItem, genres: string[], type?: string): boolean {
  const itemGenres = new Set((item.genres ?? []).map(toSlug));
  if (!genres.every((genre) => itemGenres.has(genre))) return false;
  return !type || (item.type ?? '').toLowerCase() === type;
}

export class ScraperService {
  private async execute<T>(
    { action, source, strict = false, page = 1, cacheKey, ttl }: ExecuteOptions,
    run: (adapter: ProviderAdapter) => Promise<T>
  ): Promise<Outcome<T>> {
    const hit = await cache.get<{ data: T; source: Source }>(cacheKey);
    if (hit) return { ...hit, cached: true };

    const adapters = strict && source ? [getAdapter(source)] : getOrderedAdapters(source);
    let lastError: unknown = new Error('All providers failed');
    let emptyResult: Outcome<T> | null = null;

    for (const adapter of adapters) {
      const start = Date.now();
      try {
        const data = await run(adapter);
        db.logScrape(adapter.name, action, true, Date.now() - start);
        const outcome = { data, source: adapter.name as Source, cached: false };

        if (!isEmpty(data)) {
          await cache.set(cacheKey, { data, source: outcome.source }, ttl);
          return outcome;
        }

        if (source || page > 1) return outcome;
        emptyResult ??= outcome;
      } catch (e) {
        lastError = e;
        const message = (e as Error).message;
        db.logScrape(adapter.name, action, false, Date.now() - start, message);
        console.warn(`[scraper] ${adapter.name}.${action} failed:`, message);
      }
    }

    if (emptyResult) return emptyResult;
    throw lastError;
  }

  private async aggregate(
    { action, cacheKey, ttl, adapters = getOrderedAdapters() }: AggregateOptions,
    run: (adapter: ProviderAdapter) => Promise<ListItem[]>
  ): Promise<Outcome<ListItem[]>> {
    const hit = await cache.get<Omit<Outcome<ListItem[]>, 'cached'>>(cacheKey);
    if (hit) return { ...hit, cached: true };

    const providers: Record<string, ProviderStatus> = {};
    let lastError: unknown = new Error('All providers failed');

    const lists = await Promise.all(
      adapters.map(async (adapter) => {
        const start = Date.now();
        try {
          const items = await run(adapter);
          providers[adapter.name] = items.length ? 'ok' : 'empty';
          db.logScrape(adapter.name, action, true, Date.now() - start);
          db.upsertMany(items);
          return items;
        } catch (e) {
          lastError = e;
          providers[adapter.name] = 'error';
          const message = (e as Error).message;
          db.logScrape(adapter.name, action, false, Date.now() - start, message);
          console.warn(`[scraper] ${adapter.name}.${action} failed:`, message);
          return null;
        }
      })
    );

    const fulfilled = lists.filter((list): list is ListItem[] => list !== null);
    if (adapters.length && !fulfilled.length) throw lastError;

    const result = { data: mergeItems(fulfilled), source: 'unified' as Source, providers };
    if (result.data.length) await cache.set(cacheKey, result, ttl);
    return { ...result, cached: false };
  }

  async search(query: string, opts: { page?: number; limit?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const term = query.toLowerCase();
    const run = (adapter: ProviderAdapter) => adapter.search(query, { page, limit });

    if (opts.source) {
      const result = await this.execute(
        { action: 'search', source: opts.source, page, cacheKey: `search:${opts.source}:${term}:${page}:${limit}`, ttl: config.cache.search },
        run
      );
      if (!result.cached) db.upsertMany(result.data);
      return result;
    }

    const adapters = getOrderedAdapters().filter((adapter) => page === 1 || adapter.pagedSearch);
    return this.aggregate(
      { action: 'search', adapters, cacheKey: `search:all:${term}:${page}:${limit}`, ttl: config.cache.search },
      run
    );
  }

  async latest(opts: { page?: number; type?: string; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const run = (adapter: ProviderAdapter) => adapter.latest({ page, type: opts.type });
    const cacheKey = `latest:${opts.source || 'all'}:${opts.type || 'all'}:${page}`;

    if (opts.source) {
      const result = await this.execute(
        { action: 'latest', source: opts.source, page, cacheKey, ttl: config.cache.latest },
        run
      );
      if (!result.cached) db.upsertMany(result.data);
      return result;
    }

    return this.aggregate({ action: 'latest', cacheKey, ttl: config.cache.latest }, run);
  }

  async popular(opts: { page?: number; source?: ProviderName } = {}) {
    const page = opts.page ?? 1;
    const run = (adapter: ProviderAdapter) => adapter.popular({ page });
    const cacheKey = `popular:${opts.source || 'all'}:${page}`;

    if (opts.source) {
      const result = await this.execute(
        { action: 'popular', source: opts.source, page, cacheKey, ttl: config.cache.popular },
        run
      );
      if (!result.cached) db.upsertMany(result.data);
      return result;
    }

    return this.aggregate({ action: 'popular', cacheKey, ttl: config.cache.popular }, run);
  }

  async browse(opts: { genre?: string; type?: string; page?: number; limit?: number; source?: ProviderName }) {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    const genres = (opts.genre ?? '').split(',').map(toSlug).filter(Boolean);
    const type = opts.type?.trim().toLowerCase() || undefined;
    const cacheKey = `browse:${opts.source || 'all'}:${genres.join('+')}:${type || 'all'}:${page}:${limit}`;

    const run = async (adapter: ProviderAdapter) => {
      const pool = await this.pool(adapter, type);
      return pool.filter((item) => matches(item, genres, type)).slice((page - 1) * limit, page * limit);
    };

    if (opts.source) {
      return this.execute(
        { action: 'browse', source: opts.source, page, cacheKey, ttl: config.cache.popular },
        run
      );
    }

    return this.aggregate({ action: 'browse', cacheKey, ttl: config.cache.popular }, run);
  }

  private async pool(adapter: ProviderAdapter, type?: string): Promise<ListItem[]> {
    const key = `pool:${adapter.name}:${type || 'all'}`;
    const hit = await cache.get<ListItem[]>(key);
    if (hit) return hit;

    const pages = Array.from({ length: config.browse.scanPages }, (_, i) => i + 1);
    const settled = await Promise.allSettled(pages.map((page) => adapter.catalog({ page, type })));
    const fulfilled = settled.filter((r): r is PromiseFulfilledResult<ListItem[]> => r.status === 'fulfilled');
    if (!fulfilled.length) throw (settled[0] as PromiseRejectedResult).reason;

    const unique = new Map(fulfilled.flatMap((r) => r.value).map((item) => [item.id, item]));
    const items = [...unique.values()];
    if (items.length) await cache.set(key, items, config.cache.popular);
    return items;
  }

  async types(opts: { source?: ProviderName } = {}) {
    if (opts.source) {
      return this.execute(
        { action: 'types', source: opts.source, strict: true, cacheKey: `types:${opts.source}`, ttl: config.cache.genres },
        (adapter) => adapter.types()
      );
    }

    const cacheKey = 'types:all';
    const hit = await cache.get<{ data: string[]; source: Source }>(cacheKey);
    if (hit) return { ...hit, cached: true };

    const settled = await Promise.allSettled(getOrderedAdapters().map((adapter) => adapter.types()));
    const merged = new Set(settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
    const result = { data: [...merged].sort(), source: 'unified' as Source };
    if (result.data.length) await cache.set(cacheKey, result, config.cache.genres);
    return { ...result, cached: false };
  }

  async detail(source: ProviderName, id: string) {
    const result = await this.execute(
      { action: 'detail', source, strict: true, cacheKey: `detail:${source}:${id}`, ttl: config.cache.detail },
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
        const key = genre.slug || toSlug(genre.name);
        if (!unique.has(key)) unique.set(key, genre);
      }
    }

    const result = { data: [...unique.values()], source: 'unified' as Source };
    if (result.data.length) await cache.set(cacheKey, result, config.cache.genres);
    return { ...result, cached: false };
  }
}

export const scraper = new ScraperService();
