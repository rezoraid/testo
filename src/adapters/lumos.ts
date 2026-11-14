import * as lumos from '../scrapers/lumos.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

export class LumosAdapter extends BaseAdapter {
  name = 'lumos' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const raw = await lumos.search(query, { limit: opts.limit ?? 20 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async latest(opts: { page?: number } = {}): Promise<ListItem[]> {
    const raw = await lumos.latest({ page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    const raw = await lumos.popular({ page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async detail(id: string): Promise<DetailItem> {
    const d = await lumos.detail(this.parseId(id));
    const chapters = (d.chapters || []).map((c: any) => ({
      id: c.slug,
      number: String(c.number ?? ''),
      title: c.title || '',
      date: null,
    }));

    return this.requireDetail({
      id: this.makeId(d.slug),
      source: this.name,
      title: d.title,
      cover: d.cover || '',
      type: d.type,
      status: d.status,
      genres: d.genres || [],
      rating: d.rating ?? null,
      chapterCount: chapters.length,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      chapters,
    });
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    const c = await lumos.chapter(this.parseId(seriesId), this.parseId(chapterId));
    return {
      id: c.slug,
      source: this.name,
      seriesId: c.comic,
      number: c.number,
      images: this.requireImages(c.images || []),
      prev: c.prev,
      next: c.next,
      url: c.url,
      headers: lumos.imageHeaders(),
    };
  }

  async genres(): Promise<GenreItem[]> {
    const items = await this.popular({ page: 1 });
    const names = new Set(items.flatMap((item) => item.genres ?? []));
    return [...names].sort().map((name) => ({
      id: this.toSlug(name),
      name,
      slug: this.toSlug(name),
      source: this.name,
    }));
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
      latestChapter: i.latestChapter ?? i.chapters?.[0]?.number ?? null,
      url: i.url,
    };
  }
}
