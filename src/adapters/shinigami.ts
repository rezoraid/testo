import * as shinigami from '../scrapers/shinigami.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

export class ShinigamiAdapter extends BaseAdapter {
  name = 'shinigami' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const raw = await shinigami.search(query, { page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i))).slice(0, opts.limit ?? 20);
  }

  async latest(opts: { page?: number } = {}): Promise<ListItem[]> {
    const raw = await shinigami.latest({ page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    const raw = await shinigami.popular({ page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async detail(id: string): Promise<DetailItem> {
    const d = await shinigami.detail(this.parseId(id));
    const chapters = (d.chapters || []).map((c: any) => ({
      id: String(c.id),
      number: String(c.number ?? ''),
      title: c.title || '',
      date: c.date || null,
    }));

    return this.requireDetail({
      id: this.makeId(d.id),
      source: this.name,
      title: d.title,
      cover: d.cover || '',
      type: d.type,
      status: d.status,
      genres: d.genres || [],
      latestChapter: d.latestChapter ?? chapters[0]?.number ?? null,
      chapterCount: chapters.length,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      artist: d.artist || '',
      year: d.year ?? null,
      chapters,
    });
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    const c = await shinigami.chapter(this.parseId(chapterId));
    return {
      id: String(c.id),
      source: this.name,
      seriesId: String(c.mangaId || this.parseId(seriesId)),
      number: String(c.number ?? ''),
      images: this.requireImages(c.images || []),
      prev: c.prev ? String(c.prev) : null,
      next: c.next ? String(c.next) : null,
      headers: shinigami.imageHeaders,
    };
  }

  async genres(): Promise<GenreItem[]> {
    const list = await shinigami.genres();
    return list.map((g: any) => ({ ...g, source: this.name }));
  }

  private normalizeItem(i: any): ListItem {
    return {
      id: this.makeId(i.id),
      source: this.name,
      title: i.title || '',
      cover: i.cover || '',
      type: i.type || '',
      status: i.status || '',
      genres: i.genres || [],
      latestChapter: i.latestChapter ?? null,
      url: i.url,
    };
  }
}
