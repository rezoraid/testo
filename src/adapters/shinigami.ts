import * as shinigami from './shinigami.js';
import { BaseAdapter } from './base.js';
import type { ListItem, DetailItem, ChapterContent, GenreItem } from '../types/index.js';

const API = 'https://api.shngm.io';
const BASE = 'https://app.shinigami.asia';
const UA = 'Mozilla/5.0 (Android 14; Mobile; rv:153.0) Gecko/153.0 Firefox/153.0';

async function api(path: string, retries = 2): Promise<any> {
  try {
    const res = await fetch(API + path, {
      headers: { 'user-agent': UA, origin: BASE, referer: `${BASE}/`, accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const json = await res.json();
    if (json.retcode !== undefined && json.retcode !== 0) throw new Error(json.message || 'API error');
    return json;
  } catch (e) {
    if (retries <= 0 || (e as any).status === 404) throw e;
    await new Promise((r) => setTimeout(r, 400));
    return api(path, retries - 1);
  }
}

export class ShinigamiAdapter extends BaseAdapter {
  name = 'shinigami' as const;

  async search(query: string, opts: { page?: number; limit?: number } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    const raw = await shinigami.search(query, { page });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async latest(opts: { page?: number } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    const raw = await shinigami.latest({ page });
    return raw.map((i: any) => this.normalizeItem(i));
  }

  async popular(opts: { page?: number } = {}): Promise<ListItem[]> {
    const page = opts.page ?? 1;
    // sort_by=view_count works for popularity ranking
    const res = await api(`/v1/manga/list?page=${page}&page_size=24&sort_by=view_count`);
    const items = (res.data ?? []).filter((m: any) => m?.manga_id && m.title);
    return items.map((m: any) => this.normalizeItem({
      title: m.title,
      id: m.manga_id,
      cover: m.cover_portrait_url || m.cover_image_url || '',
      type: (m.taxonomy?.Type || []).map((x: any) => x?.name).filter(Boolean)[0] || '',
      status: ({ 1: 'ongoing', 2: 'hiatus' } as any)[m.status] || 'completed',
      genres: (m.taxonomy?.Genre || []).map((x: any) => x?.name).filter(Boolean),
      latestChapter: m.latest_chapter_number ?? null,
    }));
  }

  async detail(id: string): Promise<DetailItem> {
    const mid = this.parseId(id);
    const d = await shinigami.detail(mid);
    return {
      id: this.makeId(d.id),
      source: this.name,
      title: d.title,
      cover: d.cover || '',
      type: d.type,
      status: d.status,
      genres: d.genres || [],
      latestChapter: d.latestChapter,
      url: d.url,
      synopsis: d.synopsis || '',
      author: d.author || '',
      artist: d.artist || '',
      year: d.year ?? null,
      chapters: (d.chapters || []).map((c: any) => ({
        id: String(c.id),
        number: String(c.number ?? ''),
        title: c.title || '',
        date: c.date || null,
      })),
    };
  }

  async chapter(seriesId: string, chapterId: string): Promise<ChapterContent> {
    // Shinigami chapter() takes only chapterId
    const cid = this.parseId(chapterId);
    const c = await shinigami.chapter(cid);
    return {
      id: String(c.id),
      source: this.name,
      seriesId: String(c.mangaId || this.parseId(seriesId)),
      number: String(c.number ?? ''),
      images: c.images || [],
      prev: c.prev ? String(c.prev) : null,
      next: c.next ? String(c.next) : null,
    };
  }

  async genres(): Promise<GenreItem[]> {
    const res = await api('/v1/genre/list');
    const list = res.data ?? [];
    return list
      .filter((g: any) => g?.name && g?.slug)
      .map((g: any) => ({
        id: String(g.taxonomy_id ?? g.slug),
        name: g.name,
        slug: g.slug,
        source: this.name,
      }));
  }

  private normalizeItem(i: any): ListItem {
    const id = i.id || i.manga_id;
    return {
      id: this.makeId(id),
      source: this.name,
      title: i.title || '',
      cover: i.cover || '',
      type: i.type || '',
      status: i.status || '',
      genres: i.genres || [],
      latestChapter: i.latestChapter ?? null,
      url: i.url || `https://app.shinigami.asia/series/${id}/`,
    };
  }
}
