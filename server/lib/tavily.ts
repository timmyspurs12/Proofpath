import { z } from 'zod';
import { getConfig, type AppConfig } from '../config';
import { AppError } from './errors';
import { logEvent } from './logger';

const SearchResponseSchema = z.object({
  request_id: z.string().optional(),
  results: z.array(
    z.object({
      title: z.string().optional(),
      url: z.string().url(),
    }),
  ),
});

export interface TavilyDiscovery {
  urls: string[];
  requestIds: string[];
  calls: number;
}

export class TavilyClient {
  constructor(
    private config: AppConfig = getConfig(),
    private fetchImpl: typeof fetch = fetch,
  ) {}

  get configured() {
    return Boolean(this.config.tavilyApiKey);
  }

  async discover(query: string): Promise<TavilyDiscovery> {
    if (!this.config.tavilyApiKey) return { urls: [], requestIds: [], calls: 0 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl('https://api.tavily.com/search', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.tavilyApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.slice(0, 400),
          search_depth: 'basic',
          max_results: 4,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
          auto_parameters: false,
          include_usage: true,
        }),
      });
      if (!response.ok) {
        throw new AppError(
          response.status === 429 ? 429 : 502,
          'TAVILY_SEARCH_FAILED',
          'Tavily source discovery failed. Add a direct official source URL or try again.',
          response.status === 429 || response.status >= 500,
        );
      }
      const parsed = SearchResponseSchema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) {
        throw new AppError(
          502,
          'TAVILY_INVALID_RESPONSE',
          'Tavily returned an unreadable search response.',
          true,
        );
      }
      const requestIds = parsed.data.request_id ? [parsed.data.request_id] : [];
      logEvent('tavily_search', {
        request_id: parsed.data.request_id ?? null,
        results: parsed.data.results.length,
      });
      return {
        urls: parsed.data.results.map((result) => result.url),
        requestIds,
        calls: 1,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        'TAVILY_SEARCH_FAILED',
        'Tavily source discovery could not be reached.',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
