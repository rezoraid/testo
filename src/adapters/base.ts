import type { ProviderAdapter, ListItem, DetailItem, ChapterContent, GenreItem, ProviderName } from '../types/index.js';

export abstract class BaseAdapter implements ProviderAdapter {
  abstract name: ProviderName;
  readonly pagedSearch: boolean = false;

  abstract search(query: string, opts?: { page?: number; limit?: number }): Promise<ListItem[]>;
  abstract latest(opts?: { page?: number; type?: string }): Promise<ListItem[]>;
  abstract popular(opts?: { page?: number }): Promise<ListItem[]>;
  abstract detail(id: string): Promise<DetailItem>;
  abstract chapter(seriesId: string, chapterId: string): Promise<ChapterContent>;

  async genres(): Promise<GenreItem[]> {
    return [];
  }

  async catalog(opts: { page: number; type?: string }): Promise<ListItem[]> {
    return this.popular({ page: opts.page });
  }

  async types(): Promise<string[]> {
    const items = await this.catalog({ page: 1 });
    const types = items.map((item) => (item.type ?? '').toLowerCase()).filter(Boolean);
    return [...new Set(types)].sort();
  }

  protected makeId(raw: string | number): string {
    return `${this.name}:${raw}`;
  }

  protected parseId(id: string): string {
    if (id.startsWith(`${this.name}:`)) return id.slice(this.name.length + 1);
    return id;
  }

  protected tidy(items: ListItem[]): ListItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (!item.title || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }

  protected requireDetail(detail: DetailItem): DetailItem {
    const empty = !detail.chapters.length && !detail.synopsis && !detail.cover;
    if (!detail.title || empty) throw new Error('Data detail komik kosong');
    return detail;
  }

  protected requireImages(images: string[]): string[] {
    if (!images.length) throw new Error('Chapter tidak memiliki gambar');
    return images;
  }
}
