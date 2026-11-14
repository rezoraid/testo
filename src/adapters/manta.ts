import * as manta from '../scrapers/manta.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

export class MantaAdapter extends BaseAdapter {
  name = 'manta' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const limit = opts.limit ?? 20;
    const raw = await manta.search(query, { limit });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async latest(opts: { page?: number; type?: string } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    const type = opts.type ?? 'comic';
    const raw = await manta.latest({ type, page });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    // Manta home latest serves as popular/trending proxy
    return this.latest({ page: opts.page ?? 1, type: 'comic' });
  }

  async detail(id: string): Promise<DetailItem> {
    const sid = this.parseId(id);
    const d = await manta.detail(sid);
    return {
      id: this.makeId(d.id),
      source: this.name,
      title: d.title,
      cover: d.cover || '',
      type: d.type,
      genres: d.genres || [],
      chapterCount: d.chapters?.length ?? null,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      chapters: (d.chapters || []).map((c: any) => ({
        id: String(c.id),
        number: String(c.number ?? ''),
        title: c.title || '',
        date: c.date || null,
      })),
    };
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    const sid = this.parseId(seriesId);
    const eid = this.parseId(chapterId);
    const c = await manta.chapter(sid, eid);
    return {
      id: String(c.id),
      source: this.name,
      seriesId: String(c.seriesId || sid),
      number: String(c.number ?? ''),
      images: c.images || [],
      prev: c.prev ? String(c.prev) : null,
      next: c.next ? String(c.next) : null,
    };
  }

  async genres(): Promise<GenreItem[]> {
    // Derive from a few latest items
    try {
      const items = await this.latest({ page: 1 });
      const set = new Set<string>();
      for (const it of items) {
        for (const g of it.genres || []) {
          // Filter noisy tags
          if (g.length > 2 && !/^(New|Event|Free Pass|Completed)$/i.test(g)) set.add(g);
        }
      }
      return [...set].sort().map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        source: this.name,
      }));
    } catch {
      return [];
    }
  }

  private normalizeItem(i: any): ListItem {
    const id = i.id;
    return {
      id: this.makeId(id),
      source: this.name,
      title: i.title || '',
      cover: i.cover || '',
      type: i.type || '',
      genres: i.genres || [],
      chapterCount: i.chapterCount ?? null,
      latestChapter: i.chapterCount ?? null,
      url: i.url || `https://manta.net/en/series/${id}`,
    };
  }
}
