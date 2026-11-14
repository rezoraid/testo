import Fastify from 'fastify';
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
      servers: [{ url: `http://localhost:${config.port}` }],
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

  await registerRoutes(app);

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const status = (err as any).statusCode || 500;
    reply.code(status).send({
      success: false,
      error: err.message || 'Internal Server Error',
    });
  });

  // Ensure redis connection (non-blocking if fails)
  await cache.connect().catch(() => {});

  return app;
}
