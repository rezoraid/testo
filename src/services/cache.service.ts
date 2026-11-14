import { Redis } from 'ioredis';
import { config } from '../config.js';

const STARTUP_ATTEMPTS = 3;
const MEMORY_LIMIT = 500;

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class CacheService {
  private client: Redis | null = null;
  private memory = new Map<string, MemoryEntry>();

  async connect(): Promise<void> {
    if (!config.redisUrl) {
      console.warn('[redis] REDIS_URL not set, using in-memory cache');
      return;
    }

    const client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy: (times: number) => (times > STARTUP_ATTEMPTS ? null : times * 500),
    });
    client.on('error', (err: Error) => {
      console.warn('[redis] error:', err.message);
    });

    try {
      await client.connect();
      client.options.retryStrategy = (times: number) => Math.min(times * 500, 5000);
      this.client = client;
      console.log('[redis] connected');
    } catch (e) {
      client.disconnect();
      console.warn('[redis] unavailable, using in-memory cache:', (e as Error).message);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.read(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (!this.client) {
      this.writeMemory(key, raw, ttlSeconds);
      return;
    }
    try {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } catch {
      return;
    }
  }

  async quit(): Promise<void> {
    if (!this.client) return;
    await this.client.quit().catch(() => {});
    this.client = null;
  }

  private async read(key: string): Promise<string | null> {
    if (this.client) return this.client.get(key);

    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt > Date.now()) return entry.value;
    this.memory.delete(key);
    return null;
  }

  private writeMemory(key: string, value: string, ttlSeconds: number): void {
    if (this.memory.size >= MEMORY_LIMIT && !this.memory.has(key)) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export const cache = new CacheService();
