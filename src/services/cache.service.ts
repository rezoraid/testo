import { Redis } from 'ioredis';
import { config } from '../config.js';

const STARTUP_ATTEMPTS = 3;

export class CacheService {
  private client: Redis | null = null;

  async connect(): Promise<void> {
    if (!config.redisUrl) {
      console.warn('[redis] REDIS_URL not set, running without cache');
      return;
    }

    const client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times) => (times > STARTUP_ATTEMPTS ? null : times * 500),
    });
    client.on('error', (err: Error) => {
      console.warn('[redis] error:', err.message);
    });

    try {
      await client.connect();
      client.options.retryStrategy = (times) => Math.min(times * 500, 5000);
      this.client = client;
      console.log('[redis] connected');
    } catch (e) {
      client.disconnect();
      console.warn('[redis] unavailable, running without cache:', (e as Error).message);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      return;
    }
  }

  async quit(): Promise<void> {
    if (!this.client) return;
    await this.client.quit().catch(() => {});
    this.client = null;
  }
}

export const cache = new CacheService();
