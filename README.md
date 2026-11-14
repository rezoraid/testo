# Unified Scraper API

Backend Node.js + TypeScript + Fastify yang menggabungkan 3 provider scraper (Lumos, Shinigami, Manta) menjadi satu REST API terpadu.

## Fitur

- **Adapter pattern** per provider
- Format data seragam
- Endpoint: `search`, `latest`, `popular`, `detail`, `chapter`, `genres`
- **Fallback otomatis** jika satu provider gagal
- Redis caching (TTL berbeda per jenis data)
- PostgreSQL: indexing, relasi genre, chapter, connection pooling
- Rate limiting, error handling, Swagger docs
- Modular, ringan, fokus

## Quick Start

```bash
# 1. Dependencies
npm install

# 2. Infra (Postgres + Redis)
docker compose up -d

# 3. Migration
cp .env.example .env
npm run migrate

# 4. Dev
npm run dev
```

API: `http://localhost:3000`  
Docs: `http://localhost:3000/docs`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/search?q=&page=&limit=&source=` | Search |
| GET | `/api/latest?page=&type=&source=` | Latest updates |
| GET | `/api/popular?page=&source=` | Popular / trending |
| GET | `/api/detail/:source/:id` | Detail + chapter list |
| GET | `/api/chapter/:source/:seriesId/:chapterId` | Chapter images |
| GET | `/api/genres?source=` | Genre list |
| GET | `/api/providers` | List providers |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |

`source` opsional: `lumos` | `shinigami` | `manta`. Jika tidak diisi, sistem mencoba provider sesuai `PROVIDER_ORDER` dan fallback otomatis.

## ID Format

Semua ID digabung dengan prefix source: `lumos:slug`, `shinigami:uuid`, `manta:1234`.

## Struktur

```
src/
  adapters/     # Lumos, Shinigami, Manta (+ base)
  services/     # scraper (fallback + cache), cache, db
  routes/       # REST routes
  db/           # pg pool
  types/        # shared types
  config.ts
  app.ts
  index.ts
```

## Environment

Lihat `.env.example`.

## Catatan

- Scraper asli tidak diubah fungsinya; adapter hanya membungkus dan menambahkan `popular` / `genres` dari endpoint yang memang ada di situs.
- Cache miss → scrape → (async) upsert ke Postgres → cache Redis.
- Jika Redis / Postgres down, API tetap jalan (graceful degradation).
