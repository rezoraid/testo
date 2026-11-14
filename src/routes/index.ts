import type { FastifyInstance } from 'fastify';
import { scraper } from '../services/scraper.service.js';
import { runDiagnostics } from '../services/diagnostics.service.js';
import type { ProviderName } from '../types/index.js';

function parseSource(s?: string): ProviderName | undefined {
  if (!s) return undefined;
  const v = s.toLowerCase();
  if (v === 'lumos' || v === 'shinigami' || v === 'manta') return v;
  return undefined;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

  app.get<{
    Querystring: { q?: string; page?: string; limit?: string; source?: string };
  }>('/api/search', {
    schema: {
      tags: ['Comics'],
      summary: 'Search all providers at once (merged, duplicates removed) or one provider via source',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          page: { type: 'string' },
          limit: { type: 'string' },
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
        required: ['q'],
      },
    },
  }, async (req, reply) => {
    const q = (req.query.q || '').trim();
    if (!q) return reply.code(400).send({ success: false, error: 'Query q is required' });
    const start = Date.now();
    try {
      const { data, source, cached, providers } = await scraper.search(q, {
        page: Number(req.query.page) || 1,
        limit: Math.min(Number(req.query.limit) || 20, 50),
        source: parseSource(req.query.source),
      });
      return {
        success: true,
        data,
        meta: { source, providers, page: Number(req.query.page) || 1, cached, took: Date.now() - start },
      };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { page?: string; type?: string; source?: string };
  }>('/api/latest', {
    schema: {
      tags: ['Comics'],
      summary: 'Latest updates',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req, reply) => {
    const start = Date.now();
    try {
      const { data, source, cached, providers } = await scraper.latest({
        page: Number(req.query.page) || 1,
        type: req.query.type,
        source: parseSource(req.query.source),
      });
      return {
        success: true,
        data,
        meta: { source, providers, page: Number(req.query.page) || 1, cached, took: Date.now() - start },
      };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { page?: string; source?: string };
  }>('/api/popular', {
    schema: {
      tags: ['Comics'],
      summary: 'Popular / trending comics',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req, reply) => {
    const start = Date.now();
    try {
      const { data, source, cached, providers } = await scraper.popular({
        page: Number(req.query.page) || 1,
        source: parseSource(req.query.source),
      });
      return {
        success: true,
        data,
        meta: { source, providers, page: Number(req.query.page) || 1, cached, took: Date.now() - start },
      };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { genre?: string; type?: string; page?: string; limit?: string; source?: string };
  }>('/api/browse', {
    schema: {
      tags: ['Comics'],
      summary: 'Filter comics by genre (comma separated slugs, all must match) and/or type',
      querystring: {
        type: 'object',
        properties: {
          genre: { type: 'string' },
          type: { type: 'string' },
          page: { type: 'string' },
          limit: { type: 'string' },
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req, reply) => {
    const genre = (req.query.genre || '').trim();
    const type = (req.query.type || '').trim();
    if (!genre && !type) {
      return reply.code(400).send({ success: false, error: 'Query genre or type is required' });
    }
    const start = Date.now();
    const page = Number(req.query.page) || 1;
    try {
      const { data, source, cached, providers } = await scraper.browse({
        genre,
        type,
        page,
        limit: Math.min(Number(req.query.limit) || 20, 50),
        source: parseSource(req.query.source),
      });
      return { success: true, data, meta: { source, providers, page, cached, took: Date.now() - start } };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { source?: string };
  }>('/api/types', {
    schema: {
      tags: ['Comics'],
      summary: 'List available comic types',
      querystring: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const { data, source, cached } = await scraper.types({ source: parseSource(req.query.source) });
      return { success: true, data, meta: { source, cached } };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Params: { source: string; id: string };
  }>('/api/detail/:source/:id', {
    schema: {
      tags: ['Comics'],
      summary: 'Comic detail + chapter list',
      params: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
          id: { type: 'string' },
        },
        required: ['source', 'id'],
      },
    },
  }, async (req, reply) => {
    const source = parseSource(req.params.source);
    if (!source) return reply.code(400).send({ success: false, error: 'Invalid source' });
    const start = Date.now();
    try {
      const { data, source: used, cached } = await scraper.detail(source, req.params.id);
      return {
        success: true,
        data,
        meta: { source: used, cached, took: Date.now() - start },
      };
    } catch (e) {
      const status = (e as any).status === 404 ? 404 : 502;
      return reply.code(status).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Params: { source: string; seriesId: string; chapterId: string };
  }>('/api/chapter/:source/:seriesId/:chapterId', {
    schema: {
      tags: ['Comics'],
      summary: 'Chapter images',
      params: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
          seriesId: { type: 'string' },
          chapterId: { type: 'string' },
        },
        required: ['source', 'seriesId', 'chapterId'],
      },
    },
  }, async (req, reply) => {
    const source = parseSource(req.params.source);
    if (!source) return reply.code(400).send({ success: false, error: 'Invalid source' });
    const start = Date.now();
    try {
      const { data, source: used, cached } = await scraper.chapter(
        source,
        req.params.seriesId,
        req.params.chapterId
      );
      return {
        success: true,
        data,
        meta: { source: used, cached, took: Date.now() - start },
      };
    } catch (e) {
      const status = (e as any).status === 404 ? 404 : 502;
      return reply.code(status).send({ success: false, error: (e as Error).message });
    }
  });

  app.get<{
    Querystring: { source?: string };
  }>('/api/genres', {
    schema: {
      tags: ['Comics'],
      summary: 'List available genres',
      querystring: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req, reply) => {
    const start = Date.now();
    try {
      const { data, source, cached } = await scraper.genres({
        source: parseSource(req.query.source),
      });
      return {
        success: true,
        data,
        meta: { source, cached, took: Date.now() - start },
      };
    } catch (e) {
      return reply.code(502).send({ success: false, error: (e as Error).message });
    }
  });

  app.get('/api/providers', {
    schema: { tags: ['Meta'], summary: 'Available providers' },
  }, async () => ({
    success: true,
    data: [
      { name: 'lumos', description: 'Lumos / Lumoskomik' },
      { name: 'shinigami', description: 'Shinigami' },
      { name: 'manta', description: 'Manta' },
    ],
  }));

  app.get<{
    Querystring: { source?: string };
  }>('/api/diagnostics', {
    schema: {
      tags: ['Meta'],
      summary: 'Live check of every provider (search, latest, popular, genres, detail, chapter)',
      querystring: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['lumos', 'shinigami', 'manta'] },
        },
      },
    },
  }, async (req) => ({
    success: true,
    data: await runDiagnostics(parseSource(req.query.source)),
  }));
}
