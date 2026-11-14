import { query } from '../db/pool.js';
import type { ListItem, DetailItem, GenreItem } from '../types/index.js';

export class DbService {
  async upsertComic(item: ListItem | DetailItem): Promise<void> {
    try {
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
          (item as DetailItem).synopsis || null,
          (item as DetailItem).author || null,
          (item as DetailItem).artist || null,
          item.rating ?? null,
          item.latestChapter != null ? String(item.latestChapter) : null,
          item.chapterCount ?? null,
          item.url || null,
        ]
      );

      if (item.genres?.length) {
        for (const g of item.genres) {
          const slug = g.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          if (!slug) continue;
          await query(
            `INSERT INTO genres (id, name, slug) VALUES ($1,$2,$3)
             ON CONFLICT (id) DO NOTHING`,
            [slug, g, slug]
          );
          await query(
            `INSERT INTO comic_genres (comic_id, genre_id) VALUES ($1,$2)
             ON CONFLICT DO NOTHING`,
            [item.id, slug]
          );
        }
      }

      if ((item as DetailItem).chapters?.length) {
        for (const ch of (item as DetailItem).chapters) {
          await query(
            `INSERT INTO chapters (id, comic_id, number, title, date)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (comic_id, id) DO UPDATE SET
               number = COALESCE(EXCLUDED.number, chapters.number),
               title = COALESCE(EXCLUDED.title, chapters.title)`,
            [ch.id, item.id, ch.number || null, ch.title || null, ch.date || null]
          );
        }
      }
    } catch (e) {
      // non-blocking: log but don't fail the request
      console.warn('[db] upsert failed:', (e as Error).message);
    }
  }

  async upsertMany(items: ListItem[]): Promise<void> {
    await Promise.all(items.map((i) => this.upsertComic(i)));
  }

  async logScrape(provider: string, action: string, success: boolean, durationMs: number, error?: string) {
    try {
      await query(
        `INSERT INTO scrape_logs (provider, action, success, duration_ms, error) VALUES ($1,$2,$3,$4,$5)`,
        [provider, action, success, durationMs, error || null]
      );
    } catch {
      // ignore
    }
  }

  async searchLocal(q: string, limit = 20): Promise<ListItem[]> {
    try {
      const res = await query(
        `SELECT id, source, title, cover, type, status, rating, latest_chapter, chapter_count, url
         FROM comics
         WHERE to_tsvector('simple', title) @@ plainto_tsquery('simple', $1)
         ORDER BY updated_at DESC
         LIMIT $2`,
        [q, limit]
      );
      return res.rows.map((r: any) => ({
        id: r.id,
        source: r.source,
        title: r.title,
        cover: r.cover || '',
        type: r.type,
        status: r.status,
        rating: r.rating,
        latestChapter: r.latest_chapter,
        chapterCount: r.chapter_count,
        url: r.url,
      }));
    } catch {
      return [];
    }
  }
}

export const db = new DbService();
