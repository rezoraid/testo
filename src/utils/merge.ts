import { toSlug } from './slug.js';
import type { ListItem } from '../types/index.js';

export function titleKey(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function interleave<T>(lists: T[][]): T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const result: T[] = [];
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      if (i < list.length) result.push(list[i]);
    }
  }
  return result;
}

function unionGenres(a: string[] = [], b: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const name of [...a, ...b]) {
    const slug = toSlug(name);
    if (slug && !seen.has(slug)) seen.set(slug, name);
  }
  return [...seen.values()];
}

function absorb(target: ListItem, extra: ListItem): void {
  target.cover ||= extra.cover;
  target.type ||= extra.type;
  target.status ||= extra.status;
  target.rating ??= extra.rating;
  target.latestChapter ??= extra.latestChapter;
  target.chapterCount ??= extra.chapterCount;
  target.genres = unionGenres(target.genres, extra.genres);
  target.sources?.push({ source: extra.source, id: extra.id });
}

export function mergeItems(lists: ListItem[][]): ListItem[] {
  const merged = new Map<string, ListItem>();

  for (const item of interleave(lists)) {
    const key = titleKey(item.title) || item.id;
    const existing = merged.get(key);

    if (existing) {
      absorb(existing, item);
    } else {
      merged.set(key, { ...item, sources: [{ source: item.source, id: item.id }] });
    }
  }

  return [...merged.values()];
}
