import { dbEnabled, query } from '../db/pool.js';
import { toSlug } from '../utils/slug.js';
import type { ListItem, DetailItem } from '../types/index.js';

function toValidDate(value?: string | null): string | null {
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

export class DbService {
  async upsertComic(item: ListItem | DetailItem): Promise<void> {
    if (!dbEnabled) return;
    try {
      const detail = item as DetailItem;
      const originalId = item.id.includes(':') ? item.id.split(':').slice(1).join(':') : item.id;

      await query(
        `INSERT INTO comics (id, source, original_id, title, cover, type, status, synopsis, author, artist, rating, latest_chapter, chapter_count, url, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           cover = COALESCE(EXCLUDED.cover, comics.cover),
           type = COALESCE(EXCLUDED.type, comics.type),
           status = COALESCE(EXCLUDED.status, comics.status),
           synopsis = COALESCE(EXCLUDED.synopsis, comics.synopsis),
           author = COALESCE(EXCLUDED.author, comics.author),
           artist = COALESCE(EXCLUDED.artist, comics.artist),
           rating = COALESCE(EXCLUDED.rating, comics.rating),
           latest_chapter = COALESCE(EXCLUDED.latest_chapter, comics.latest_chapter),
           chapter_count = COALESCE(EXCLUDED.chapter_count, comics.chapter_count),
           url = COALESCE(EXCLUDED.url, comics.url),
           updated_at = NOW()`,
        [
          item.id,
          item.source,
          originalId,
          item.title,
          item.cover || null,
          item.type || null,
          item.status || null,
          detail.synopsis || null,
          detail.author || null,
          detail.artist || null,
          item.rating ?? null,
          item.latestChapter != null ? String(item.latestChapter) : null,
          item.chapterCount ?? null,
          item.url || null,
        ]
      );

      await this.saveGenres(item.id, item.genres ?? []);
      await this.saveChapters(item.id, detail.chapters ?? []);
    } catch (e) {
      console.warn('[db] upsert failed:', (e as Error).message);
    }
  }

  private async saveGenres(comicId: string, names: string[]): Promise<void> {
    const genres = new Map<string, string>();
    for (const name of names) {
      const slug = toSlug(name);
      if (slug) genres.set(slug, name);
    }
    if (!genres.size) return;

    const slugs = [...genres.keys()];
    await query(
      `INSERT INTO genres (id, name, slug)
       SELECT s, n, s FROM unnest($1::text[], $2::text[]) AS t(s, n)
       ON CONFLICT DO NOTHING`,
      [slugs, slugs.map((slug) => genres.get(slug))]
    );
    await query(
      `INSERT INTO comic_genres (comic_id, genre_id)
       SELECT $1, unnest($2::text[])
       ON CONFLICT DO NOTHING`,
      [comicId, slugs]
    );
  }

  private async saveChapters(comicId: string, chapters: DetailItem['chapters']): Promise<void> {
    const unique = new Map(chapters.map((ch) => [ch.id, ch]));
    if (!unique.size) return;

    const rows = [...unique.values()];
    await query(
      `INSERT INTO chapters (id, comic_id, number, title, date)
       SELECT id, $1, number, title, date
       FROM unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[]) AS t(id, number, title, date)
       ON CONFLICT (comic_id, id) DO UPDATE SET
         number = COALESCE(EXCLUDED.number, chapters.number),
         title = COALESCE(EXCLUDED.title, chapters.title),
         date = COALESCE(EXCLUDED.date, chapters.date)`,
      [
        comicId,
        rows.map((ch) => ch.id),
        rows.map((ch) => ch.number || null),
        rows.map((ch) => ch.title || null),
        rows.map((ch) => toValidDate(ch.date)),
      ]
    );
  }

  async upsertMany(items: ListItem[]): Promise<void> {
    await Promise.all(items.map((item) => this.upsertComic(item)));
  }

  async logScrape(provider: string, action: string, success: boolean, durationMs: number, error?: string): Promise<void> {
    if (!dbEnabled) return;
    try {
      await query(
        `INSERT INTO scrape_logs (provider, action, success, duration_ms, error) VALUES ($1,$2,$3,$4,$5)`,
        [provider, action, success, durationMs, error || null]
      );
    } catch {
      return;
    }
  }
}

export const db = new DbService();
