import { adapters } from '../adapters/index.js';
import type { ProviderAdapter } from '../adapters/index.js';
import type { ChapterContent, DetailItem, ListItem, ProviderName } from '../types/index.js';

interface StepReport {
  ok: boolean;
  ms: number;
  count?: number;
  missing?: Record<string, number>;
  sample?: string;
  error?: string;
}

type ProviderReport = Record<string, StepReport>;

function summarizeList(items: ListItem[]): Omit<StepReport, 'ms'> {
  return {
    ok: items.length > 0,
    count: items.length,
    missing: {
      cover: items.filter((i) => !i.cover).length,
      genres: items.filter((i) => !i.genres?.length).length,
      latestChapter: items.filter((i) => i.latestChapter == null).length,
    },
    sample: items[0]?.title,
  };
}

function summarizeDetail(detail: DetailItem): Omit<StepReport, 'ms'> {
  return {
    ok: detail.chapters.length > 0,
    count: detail.chapters.length,
    missing: {
      cover: detail.cover ? 0 : 1,
      synopsis: detail.synopsis ? 0 : 1,
      author: detail.author ? 0 : 1,
      genres: detail.genres?.length ? 0 : 1,
    },
    sample: detail.title,
  };
}

function summarizeChapter(chapter: ChapterContent): Omit<StepReport, 'ms'> {
  return { ok: chapter.images.length > 0, count: chapter.images.length, sample: chapter.images[0] };
}

async function step<T>(
  report: ProviderReport,
  name: string,
  run: () => Promise<T>,
  summarize: (value: T) => Omit<StepReport, 'ms'>
): Promise<T | undefined> {
  const start = Date.now();
  try {
    const value = await run();
    report[name] = { ...summarize(value), ms: Date.now() - start };
    return value;
  } catch (e) {
    report[name] = { ok: false, ms: Date.now() - start, error: (e as Error).message };
    return undefined;
  }
}

async function inspect(adapter: ProviderAdapter): Promise<ProviderReport> {
  const report: ProviderReport = {};

  await step(report, 'search', () => adapter.search('solo', { limit: 10 }), summarizeList);
  const latest = await step(report, 'latest', () => adapter.latest({ page: 1 }), summarizeList);
  await step(report, 'popular', () => adapter.popular({ page: 1 }), summarizeList);
  await step(report, 'genres', async () => (await adapter.genres?.()) ?? [], (list) => ({
    ok: list.length > 0,
    count: list.length,
  }));

  const first = latest?.[0];
  if (!first) return report;

  const detail = await step(report, 'detail', () => adapter.detail(first.id), summarizeDetail);
  const chapterId = detail?.chapters[0]?.id;
  if (!detail || !chapterId) return report;

  await step(report, 'chapter', () => adapter.chapter(detail.id, chapterId), summarizeChapter);
  return report;
}

export async function runDiagnostics(source?: ProviderName): Promise<Record<string, ProviderReport>> {
  const targets = Object.values(adapters).filter((adapter) => !source || adapter.name === source);
  const reports = await Promise.all(targets.map(async (adapter) => [adapter.name, await inspect(adapter)] as const));
  return Object.fromEntries(reports);
}
