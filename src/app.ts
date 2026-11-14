import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
import { cache } from './services/cache.service.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'production' ? 'info' : 'debug',
      transport:
        config.nodeEnv !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestTimeout: config.requestTimeout,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindow,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Unified Scraper API',
        description: 'Unified manga/manhwa/comic scraper combining Lumos, Shinigami, and Manta providers with automatic fallback, Redis caching, and PostgreSQL persistence.',
        version: '1.0.0',
      },
      tags: [
        { name: 'Comics', description: 'Search, latest, popular, detail, chapter' },
        { name: 'Meta', description: 'Providers & health' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.setErrorHandler((err: FastifyError, _req, reply) => {
    app.log.error(err);
    reply.code(err.statusCode ?? 500).send({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  });

  app.setNotFoundHandler((_req, reply) => {
    reply.code(404).send({ success: false, error: 'Route not found' });
  });

  await registerRoutes(app);

  await cache.connect().catch(() => {});

  return app;
}
