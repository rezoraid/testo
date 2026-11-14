import 'dotenv/config';
import type { ProviderName } from './types/index.js';

const PROVIDERS: ProviderName[] = ['lumos', 'shinigami', 'manta'];

function parseProviderOrder(raw?: string): ProviderName[] {
  const parsed = (raw ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name): name is ProviderName => PROVIDERS.includes(name as ProviderName));
  return parsed.length ? parsed : [...PROVIDERS];
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || undefined,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  redisUrl: process.env.REDIS_URL || undefined,

  cache: {
    search: 300,
    latest: 180,
    popular: 600,
    detail: 1800,
    chapter: 3600,
    genres: 86400,
  },

  providerOrder: parseProviderOrder(process.env.PROVIDER_ORDER),

  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 300,
    timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  },

  browse: {
    scanPages: Number(process.env.BROWSE_SCAN_PAGES) || 5,
  },

  requestTimeout: 30000,
};
