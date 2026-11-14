import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scraper',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Cache TTLs in seconds
  cache: {
    search: 300,      // 5 min
    latest: 180,      // 3 min
    popular: 600,     // 10 min
    detail: 1800,     // 30 min
    chapter: 3600,    // 1 hour
    genres: 86400,    // 24 h
  },

  // Provider order for fallback (first = preferred)
  providerOrder: (process.env.PROVIDER_ORDER || 'lumos,shinigami,manta').split(',') as Array<'lumos' | 'shinigami' | 'manta'>,

  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },

  requestTimeout: 20000,
};
