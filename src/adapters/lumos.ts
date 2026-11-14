import * as lumos from './lumos.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

const BASES = ['https://03.lumosgg.com', 'https://02.lumosgg.com', 'https://lumoskomik.com'];
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

async function getJson(path: string) {
  let lastErr: unknown;
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, {
        headers: { 'user-agent': UA, referer: `${base}/` },
        signal: AbortSignal.timeout(12000),
      });
      if (res.status === 404) throw Object.assign(new Error('Tidak ditemukan'), { status: 404 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if ((e as any).status === 404) break;
    }
  }
  throw lastErr;
}

export class LumosAdapter extends BaseAdapter {
  name = 'lumos' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const limit = opts.limit ?? 20;
    const raw = await lumos.search(query, { limit });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async latest(opts: { page?: number } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    const raw = await lumos.latest({ page });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    // Use discovered /api/popular endpoint (original scraper does not expose it)
    const data = await getJson(`/api/popular?page=${page}`);
    const items = Array.isArray(data?.data) ? data.data : [];
    return items.map((i: any) =>
      this.normalizeItem({
        title: i.title,
        slug: i.slug,
        cover: i.coverImage || i.cover,
        type: i.type,
        status: i.status,
        rating: i.rating,
        genres: i.genres,
        latestChapter: i.latestChapter,
      })
    );
  }

  async detail(id: string): Promise<DetailItem> {
    const slug = this.parseId(id);
    const d = await lumos.detail(slug);
    return {
      id: this.makeId(d.slug),
      source: this.name,
      title: d.title,
      cover: d.cover || '',
      type: d.type,
      status: d.status,
      genres: d.genres || [],
      rating: d.rating ?? null,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      chapters: (d.chapters || []).map((c: any) => ({
        id: c.slug,
        number: String(c.number ?? ''),
        title: c.title || '',
      })),
    };
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    const slug = this.parseId(seriesId);
    const chSlug = this.parseId(chapterId);
    const c = await lumos.chapter(slug, chSlug);
    return {
      id: c.slug,
      source: this.name,
      seriesId: c.comic,
      number: '', // original does not always return number
      images: c.images || [],
      prev: c.prev,
      next: c.next,
      url: c.url,
    };
  }

  async genres(): Promise<GenreItem[]> {
    // Derive from popular items (no dedicated genre list endpoint)
    try {
      const items = await this.popular({ page: 1 });
      const set = new Set<string>();
      for (const it of items) {
        for (const g of it.genres || []) set.add(g);
      }
      return [...set].sort().map((name) => ({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-'),
        source: this.name,
      }));
    } catch {
      return [];
    }
  }

  private normalizeItem(i: any): ListItem {
    const slug = i.slug || i.id;
    return {
      id: this.makeId(slug),
      source: this.name,
      title: i.title || '',
      cover: i.cover || '',
      type: i.type || '',
      status: i.status || '',
      genres: i.genres || [],
      rating: i.rating ?? null,
      latestChapter: i.latestChapter ?? (i.chapters?.[0]?.number ?? null),
      url: i.url,
    };
  }
}
