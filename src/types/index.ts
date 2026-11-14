export type ProviderName = 'lumos' | 'shinigami' | 'manta';

export interface ListItem {
  id: string;
  source: ProviderName;
  title: string;
  cover: string;
  type?: string;
  status?: string;
  genres?: string[];
  rating?: number | null;
  latestChapter?: string | number | null;
  chapterCount?: number | null;
  url?: string;
  sources?: Array<{ source: ProviderName; id: string }>;
}

export interface ChapterMeta {
  id: string;
  number: string;
  title?: string;
  date?: string | null;
}

export interface DetailItem extends ListItem {
  synopsis: string;
  altTitles?: string[];
  author?: string;
  artist?: string;
  year?: number | null;
  chapters: ChapterMeta[];
}

export interface ChapterContent {
  id: string;
  source: ProviderName;
  seriesId: string;
  number: string;
  images: string[];
  prev?: string | null;
  next?: string | null;
  url?: string;
  headers?: Record<string, string>;
}

export interface GenreItem {
  id: string;
  name: string;
  slug: string;
  source?: ProviderName;
}

export interface ProviderAdapter {
  name: ProviderName;
  pagedSearch: boolean;
  search(query: string, opts?: { page?: number; limit?: number }): Promise<ListItem[]>;
  latest(opts?: { page?: number; type?: string }): Promise<ListItem[]>;
  popular(opts?: { page?: number }): Promise<ListItem[]>;
  detail(id: string): Promise<DetailItem>;
  chapter(seriesId: string, chapterId: string): Promise<ChapterContent>;
  genres?(): Promise<GenreItem[]>;
  types(): Promise<string[]>;
  catalog(opts: { page: number; type?: string }): Promise<ListItem[]>;
  imageHeaders?(): Record<string, string>;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    source?: ProviderName | 'unified';
    page?: number;
    cached?: boolean;
    providers?: Record<string, 'ok' | 'empty' | 'error'>;
    took?: number;
  };
  error?: string;
}
