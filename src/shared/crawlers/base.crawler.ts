import { Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { CrawlResult } from './base-api.crawler';
import { ProtocolSnapshot } from '../entities/protocol-snapshot.entity';

export interface CrawlerOptions {
    headless?: boolean;
    viewport?: { width: number; height: number };
    userAgent?: string;
    waitForNetworkIdle?: boolean;
    pageWaitMs?: number;
    timeout?: number;
    retries?: number;
    retryDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<CrawlerOptions> = {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    waitForNetworkIdle: true,
    pageWaitMs: 3000,
    timeout: 30000,
    retries: 2,
    retryDelayMs: 2000,
};

/**
 * Abstract base class for Playwright (headless browser) crawlers.
 *
 * Use this ONLY when a protocol page is a JS-heavy SPA without a public API.
 * For protocols with REST APIs, extend `BaseApiCrawler` instead — it's simpler.
 *
 * Subclasses must implement:
 * - `extractData($: CheerioAPI): T[]`  ← parse raw HTML into typed items
 *
 * Optionally override:
 * - `onPageLoaded(page)` ← scroll, click, wait before extraction
 */
export abstract class BaseCrawler<T> {
    protected abstract readonly logger: Logger;
    protected abstract readonly url: string;
    protected abstract readonly network: string;
    protected abstract readonly protocol: string;
    protected abstract readonly poolType: string;

    protected options: Required<CrawlerOptions>;

    constructor(options: CrawlerOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }

    /** Extract structured data from loaded page HTML. */
    protected abstract extractData($: cheerio.CheerioAPI): T[];

    /** Hook: called after page load, before extraction. Override for scroll/click. */
    protected async onPageLoaded(_page: Page): Promise<void> {
        // Default: no-op
    }

    /** Map an extracted item to the unified ProtocolSnapshot shape. */
    protected abstract toSnapshot(item: T): ProtocolSnapshot;

    /** Main crawl method — handles browser lifecycle, retries, and timing. */
    async crawl(): Promise<CrawlResult<ProtocolSnapshot>> {
        const startTime = Date.now();
        this.logger.log(`🌐 Crawling: ${this.url}`);

        let lastError: Error | null = null;
        const snapshots: ProtocolSnapshot[] = [];

        for (let attempt = 1; attempt <= this.options.retries + 1; attempt++) {
            let browser: Browser | null = null;
            try {
                browser = await chromium.launch({ headless: this.options.headless });
                const context: BrowserContext = await browser.newContext({
                    viewport: this.options.viewport,
                    userAgent: this.options.userAgent,
                });
                const page = await context.newPage();

                page.on('requestfailed', (req) =>
                    this.logger.warn(`❌ Req fail: ${req.url()} — ${req.failure()?.errorText}`),
                );

                await page.goto(this.url, {
                    waitUntil: this.options.waitForNetworkIdle ? 'networkidle' : 'domcontentloaded',
                    timeout: this.options.timeout,
                });

                if (this.options.pageWaitMs > 0) {
                    await page.waitForTimeout(this.options.pageWaitMs);
                }

                await this.onPageLoaded(page);

                const html = await page.content();
                const $ = cheerio.load(html);
                const items = this.extractData($);
                snapshots.push(...items.map((item) => this.toSnapshot(item)));

                const duration = Date.now() - startTime;
                this.logger.log(`✅ Done in ${duration}ms — ${snapshots.length} items`);

                return {
                    protocol: this.protocol,
                    network: this.network,
                    poolType: this.poolType,
                    timestamp: new Date().toISOString(),
                    duration,
                    itemsFound: snapshots.length,
                    data: snapshots,
                };
            } catch (error) {
                lastError = error as Error;
                this.logger.warn(`⚠️ Attempt ${attempt} failed: ${lastError.message}`);
                if (attempt <= this.options.retries) {
                    await this.sleep(this.options.retryDelayMs * attempt);
                }
            } finally {
                await browser?.close().catch(() => { /* ignore */ });
            }
        }

        this.logger.error(`❌ All attempts failed for ${this.url}`);
        throw lastError!;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
