import * as manta from '../scrapers/manta.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

const NOISY_TAGS = /^(New|Event|Free Pass|Completed)$/i;

export class MantaAdapter extends BaseAdapter {
  name = 'manta' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const raw = await manta.search(query, { limit: opts.limit ?? 20 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async latest(opts: { page?: number; type?: string } = {}): Promise<ListItem[]> {
    const raw = await manta.latest({ type: opts.type ?? 'comic', page: opts.page ?? 1 });
    return this.tidy(raw.map((i: any) => this.normalizeItem(i)));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    return this.latest({ page: opts.page ?? 1, type: 'comic' });
  }

  async detail(id: string): Promise<DetailItem> {
    const d = await manta.detail(this.parseId(id));
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
      genres: d.genres || [],
      latestChapter: chapters[0]?.number ?? null,
      chapterCount: chapters.length,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      chapters,
    });
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    const sid = this.parseId(seriesId);
    const c = await manta.chapter(sid, this.parseId(chapterId));
    return {
      id: String(c.id),
      source: this.name,
      seriesId: String(c.seriesId || sid),
      number: String(c.number ?? ''),
      images: this.requireImages(c.images || []),
      prev: c.prev ? String(c.prev) : null,
      next: c.next ? String(c.next) : null,
      headers: manta.imageHeaders,
    };
  }

  async genres(): Promise<GenreItem[]> {
    const items = await this.latest({ page: 1 });
    const names = new Set(
      items.flatMap((item) => item.genres ?? []).filter((g) => g.length > 2 && !NOISY_TAGS.test(g))
    );
    return [...names].sort().map((name) => ({
      id: this.toSlug(name),
      name,
      slug: this.toSlug(name),
      source: this.name,
    }));
  }

  private normalizeItem(i: any): ListItem {
    return {
      id: this.makeId(i.id),
      source: this.name,
      title: i.title || '',
      cover: i.cover || '',
      type: i.type || '',
      genres: i.genres || [],
      chapterCount: i.chapterCount ?? null,
      latestChapter: i.chapterCount ?? null,
      url: i.url,
    };
  }
}
