import { pool, query } from '../src/db/pool.js';

const migrations = `
CREATE TABLE IF NOT EXISTS comics (
  id            TEXT PRIMARY KEY,          -- source:originalId
  source        TEXT NOT NULL,
  original_id   TEXT NOT NULL,
  title         TEXT NOT NULL,
  cover         TEXT,
  type          TEXT,
  status        TEXT,
  synopsis      TEXT,
  author        TEXT,
  artist        TEXT,
  rating        REAL,
  latest_chapter TEXT,
  chapter_count INTEGER,
  url           TEXT,
  raw           JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comics_source ON comics(source);
CREATE INDEX IF NOT EXISTS idx_comics_title ON comics USING gin (to_tsvector('simple', title));
CREATE INDEX IF NOT EXISTS idx_comics_updated ON comics(updated_at DESC);

CREATE TABLE IF NOT EXISTS genres (
  id    TEXT PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS comic_genres (
  comic_id  TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  genre_id  TEXT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (comic_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_comic_genres_genre ON comic_genres(genre_id);

CREATE TABLE IF NOT EXISTS chapters (
  id          TEXT NOT NULL,              -- chapter id from provider
  comic_id    TEXT NOT NULL REFERENCES comics(id) ON DELETE CASCADE,
  number      TEXT,
  title       TEXT,
  date        TIMESTAMPTZ,
  PRIMARY KEY (comic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_chapters_comic ON chapters(comic_id);

CREATE TABLE IF NOT EXISTS scrape_logs (
  id          BIGSERIAL PRIMARY KEY,
  provider    TEXT,
  action      TEXT,
  success     BOOLEAN,
  duration_ms INTEGER,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_created ON scrape_logs(created_at DESC);
`;

async function main() {
  console.log('Running migrations...');
  await query(migrations);
  console.log('Migrations completed successfully.');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
