import Redis from 'ioredis';
import { config } from '../config.js';

export class CacheService {
  private client: Redis | null = null;
  private enabled = true;

  async connect(): Promise<void> {
    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: true,
        connectTimeout: 5000,
      });
      await this.client.connect();
      this.client.on('error', (err) => {
        console.warn('[redis] error:', err.message);
      });
      console.log('[redis] connected');
    } catch (e) {
      console.warn('[redis] unavailable, running without cache:', (e as Error).message);
      this.enabled = false;
      this.client = null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // ignore
    }
  }

  async del(pattern: string): Promise<void> {
    if (!this.enabled || !this.client) return;
    try {
      if (pattern.includes('*')) {
        const keys = await this.client.keys(pattern);
        if (keys.length) await this.client.del(...keys);
      } else {
        await this.client.del(pattern);
      }
    } catch {
      // ignore
    }
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
      this.client = null;
    }
  }
}

export const cache = new CacheService();
