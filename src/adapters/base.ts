import type { ProviderAdapter, ListItem, DetailItem, ChapterContent, GenreItem, ProviderName } from '../types/index.js';

export abstract class BaseAdapter implements ProviderAdapter {
  abstract name: ProviderName;

  abstract search(query: string, opts?: { page?: number; limit?: number }): Promise<ListItem[]>;
  abstract latest(opts?: { page?: number; type?: string }): Promise<ListItem[]>;
  abstract popular(opts?: { page?: number }): Promise<ListItem[]>;
  abstract detail(id: string): Promise<DetailItem>;
  abstract chapter(seriesId: string, chapterId: string): Promise<ChapterContent>;

  async genres(): Promise<GenreItem[]> {
    return [];
  }

  protected makeId(raw: string | number): string {
    return `${this.name}:${raw}`;
  }

  protected parseId(id: string): string {
    if (id.startsWith(`${this.name}:`)) return id.slice(this.name.length + 1);
    return id;
  }
}
