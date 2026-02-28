import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import { Protocol, Network, PoolType, ProtocolSnapshot } from '../../../shared/entities/protocol-snapshot.entity';

// ─── Raw Pool Shape (scraped from the UI table) ───────────────────────────────

export interface RawHydrationPool {
    /** Token symbol / pool asset label, e.g. "GDOT", "2-Pool" */
    assetSymbol: string;
    /** Full label beneath the symbol, e.g. "GigaDOT", "USDT, USDC" */
    assetName?: string;
    /** Price in USD, e.g. "$1.461" → 1.461 */
    priceUsd?: number;
    /** 24-hour trading volume in USD */
    volume24hUsd?: number;
    /** Total Value Locked in USD */
    tvlUsd?: number;
    /** Combined Fee + Farm APR percentage, e.g. "12.67%" → 12.67 */
    feeAndFarmApr?: number;
    /** Pool category derived from token names */
    poolCategory: 'omnipool' | 'stablepool';
}

// ─── Crawler ─────────────────────────────────────────────────────────────────

/**
 * HydrationOmnipoolCrawler
 *
 * Uses Playwright to scrape https://app.hydration.net/liquidity/omnipool-stablepools.
 *
 * DOM structure (confirmed via live browser inspection):
 *   - Standard HTML <table> with <tbody> <tr> rows
 *   - Each <td> contains a <p> element with the value text
 *   - Columns: [0] Pool Asset, [1] Price, [2] 24H Volume, [3] TVL, [4] Fee+Farm APR
 *   - Symbol: td:first-child → first <p>
 *   - Name:   td:first-child → second <p> (optional sub-label)
 *   - Pagination: series of <button> elements; "Next" becomes plain text on last page
 *
 * Paginates through all pages automatically by clicking the "Next" button
 * until it is no longer rendered as a <button> element.
 */
@Injectable()
export class HydrationOmnipoolCrawler {
    protected readonly logger = new Logger(HydrationOmnipoolCrawler.name);

    private readonly TARGET_URL = 'https://app.hydration.net/liquidity/omnipool-stablepools';

    // ─── Main entry point ────────────────────────────────────────────────────

    async crawl(): Promise<{
        data: ProtocolSnapshot[];
        duration: number;
        itemsFound: number;
        protocol: string;
        network: string;
        poolType: string;
        timestamp: string;
    }> {
        const startTime = Date.now();
        this.logger.log('🚀 [hydration/polkadot/dex] Starting Playwright crawl');

        let browser: Browser | null = null;
        let pools: RawHydrationPool[] = [];

        try {
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });

            const page = await browser.newPage();
            page.setDefaultTimeout(60_000);

            pools = await this.scrapeAllPages(page);
            this.logger.log(`✅ Crawl complete — ${pools.length} pools found`);
        } catch (error) {
            this.logger.error(
                `❌ Crawl failed: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw error;
        } finally {
            if (browser) await browser.close();
        }

        const data = pools.map((p) => this.toSnapshot(p));
        const duration = Date.now() - startTime;

        return {
            protocol: Protocol.HYDRATION,
            network: Network.HYDRATION,
            poolType: PoolType.DEX,
            timestamp: new Date().toISOString(),
            duration,
            itemsFound: data.length,
            data,
        };
    }

    // ─── Page orchestrator ───────────────────────────────────────────────────

    private async scrapeAllPages(page: Page): Promise<RawHydrationPool[]> {
        this.logger.log(`🌐 Navigating to ${this.TARGET_URL}`);

        await page.goto(this.TARGET_URL, { waitUntil: 'networkidle', timeout: 60_000 });

        // Dismiss the "New UI preview" modal/overlay if it appears
        await this.dismissModal(page);

        // Wait for the pool table to be rendered
        await page.waitForSelector('table tbody tr', { timeout: 30_000 });

        // Extra settle time for dynamic content
        await page.waitForTimeout(2_000);

        const allPools: RawHydrationPool[] = [];
        let pageNum = 1;

        while (true) {
            this.logger.log(`📄 Scraping page ${pageNum}...`);

            // Scroll to reveal any lazily-loaded rows
            await this.scrollToBottom(page);
            await page.waitForTimeout(1_000);

            // Collect rows from the visible table
            const pools = await this.scrapeCurrentPage(page);
            this.logger.log(`   ↳ Found ${pools.length} pools on page ${pageNum}`);
            allPools.push(...pools);

            // Navigate to the next page if the button exists
            const hasNext = await this.clickNextPage(page);
            if (!hasNext) {
                this.logger.log('🏁 No more pages — pagination complete');
                break;
            }

            pageNum++;
            // Wait for the table to re-render after page change
            await page.waitForTimeout(2_500);
        }

        return allPools;
    }

    // ─── Dismiss intro modal ─────────────────────────────────────────────────

    private async dismissModal(page: Page): Promise<void> {
        try {
            const skipBtn = await page.$('button:has-text("Skip"), button:has-text("Dismiss"), button:has-text("Close")');
            if (skipBtn) {
                await skipBtn.click();
                this.logger.log('ℹ️ Dismissed intro modal');
                await page.waitForTimeout(1_000);
            }
        } catch {
            // Modal not present — that's fine
        }
    }

    // ─── Smooth scroll to bottom ─────────────────────────────────────────────

    private async scrollToBottom(page: Page): Promise<void> {
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 400;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 150);
            });
        });
    }

    // ─── Scrape rows from the current page ───────────────────────────────────

    private async scrapeCurrentPage(page: Page): Promise<RawHydrationPool[]> {
        return page.evaluate((): RawHydrationPool[] => {
            const results: RawHydrationPool[] = [];

            // DOM structure (confirmed via live browser inspection):
            //   <table> → <tbody> → <tr>  (one row per pool)
            //   Each column value is wrapped in a <p> inside the <td>
            const rows = Array.from(document.querySelectorAll('table tbody tr'));

            for (const row of rows) {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length < 4) continue;

                // ── Pool Asset (col 0) ─────────────────────────────────────────
                // Symbol is in the first <p>, optional name label in the second <p>
                const col0 = cells[0];
                const pTags = Array.from(col0.querySelectorAll('p'));
                const rawSymbol = pTags[0]?.textContent?.trim() ?? '';
                if (!rawSymbol) continue;

                const assetName = pTags[1]?.textContent?.trim();

                // ── Pool category heuristic ────────────────────────────────────
                const poolCategory: 'omnipool' | 'stablepool' =
                    (assetName?.includes('USDT') ?? false) ||
                        (assetName?.includes('USDC') ?? false) ||
                        rawSymbol.includes('Pool') ||
                        rawSymbol.includes('HUSDs') ||
                        rawSymbol.includes('HUSDe')
                        ? 'stablepool'
                        : 'omnipool';

                // ── Price (col 1) ──────────────────────────────────────────────
                const rawPrice = cells[1]?.querySelector('p')?.textContent?.trim();

                // ── 24H Volume (col 2) ─────────────────────────────────────────
                const rawVolume = cells[2]?.querySelector('p')?.textContent?.trim();

                // ── TVL (col 3) ────────────────────────────────────────────────
                const rawTvl = cells[3]?.querySelector('p')?.textContent?.trim();

                // ── Fee + Farm APR (col 4) ─────────────────────────────────────
                // May be compound (fee% + farm%) — extract first numeric percentage
                const rawApr = cells[4]?.textContent?.trim();

                results.push({
                    assetSymbol: rawSymbol,
                    assetName,
                    priceUsd: parseDollar(rawPrice),
                    volume24hUsd: parseDollar(rawVolume),
                    tvlUsd: parseDollar(rawTvl),
                    feeAndFarmApr: parsePercent(rawApr),
                    poolCategory,
                });
            }

            return results;

            // ── Inline helpers (browser context — no Node.js imports allowed) ──
            function parseDollar(raw: string | undefined): number | undefined {
                if (!raw) return undefined;
                const cleaned = raw.replace(/[$,\s]/g, '');
                const n = parseFloat(cleaned);
                return isNaN(n) ? undefined : n;
            }

            function parsePercent(raw: string | undefined): number | undefined {
                if (!raw) return undefined;
                const match = raw.match(/([\d.]+)\s*%/);
                if (!match) return undefined;
                const n = parseFloat(match[1]);
                return isNaN(n) ? undefined : n;
            }
        });
    }

    // ─── Navigate to the next pagination page ────────────────────────────────

    private async clickNextPage(page: Page): Promise<boolean> {
        try {
            // Scroll to where pagination controls are rendered
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(500);

            // Key insight from browser inspection:
            // On the LAST page, "Next" is rendered as PLAIN TEXT — not a <button>.
            // So we only look for a <button> containing "Next".
            const nextBtn = await page.$('button:has-text("Next")');

            if (!nextBtn) {
                this.logger.log('ℹ️ "Next" is not a button — last page reached');
                return false;
            }

            // Verify not disabled
            const ariaDisabled = await nextBtn.getAttribute('aria-disabled');
            if (ariaDisabled === 'true') return false;

            const isDisabled = await nextBtn.isDisabled();
            if (isDisabled) return false;

            const className = (await nextBtn.getAttribute('class')) ?? '';
            if (/disabled/i.test(className)) return false;

            this.logger.log('➡️  Clicking "Next" page...');
            await nextBtn.click();
            return true;
        } catch (err) {
            this.logger.warn(`⚠️ clickNextPage error: ${err}`);
            return false;
        }
    }

    // ─── Map raw pool → ProtocolSnapshot ─────────────────────────────────────

    private toSnapshot(raw: RawHydrationPool): ProtocolSnapshot {
        return {
            protocol: Protocol.HYDRATION,
            network: Network.HYDRATION,
            poolType: PoolType.DEX,
            assetSymbol: raw.assetSymbol,
            // For DEX/AMM pools, totalApy holds the combined Fee+Farm APR
            totalApy: raw.feeAndFarmApr,
            tvlUsd: raw.tvlUsd,
            dataTimestamp: new Date(),
            crawledAt: new Date(),
            metadata: {
                assetName: raw.assetName,
                priceUsd: raw.priceUsd,
                volume24hUsd: raw.volume24hUsd,
                feeAndFarmApr: raw.feeAndFarmApr,
                poolCategory: raw.poolCategory,
                sourceUrl: 'https://app.hydration.net/liquidity/omnipool-stablepools',
            },
        } as ProtocolSnapshot;
    }
}
