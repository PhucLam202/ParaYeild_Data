import { Logger } from '@nestjs/common';
import { chromium, Browser } from 'playwright';

const logger = new Logger('HydrationVolumeScraper');

/**
 * Scrapes 24H trading volumes from the Hydration UI.
 *
 * Returns a Map<assetSymbol, volume24hUsd>.
 * Graceful degradation: returns empty map on any failure.
 */
export async function scrapeHydrationVolumes(): Promise<Map<string, number>> {
    const volumes = new Map<string, number>();
    let browser: Browser | undefined;

    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        page.setDefaultTimeout(30_000);

        logger.log('🌐 Navigating to Hydration all-pools page...');
        await page.goto('https://app.hydration.net/liquidity/all-pools', {
            waitUntil: 'networkidle',
            timeout: 60_000,
        });

        // Dismiss any modal
        try {
            const skipBtn = await page.$(
                'button:has-text("Skip"), button:has-text("Dismiss"), button:has-text("Close")',
            );
            if (skipBtn) await skipBtn.click();
        } catch {
            // no modal
        }

        await page.waitForSelector('table tbody tr', { timeout: 30_000 });
        await page.waitForTimeout(2_000);

        // Paginate and collect volumes
        let pageNum = 1;
        while (true) {
            logger.log(`📄 Scraping volumes page ${pageNum}...`);
            await page.waitForTimeout(1_000);

            const pageVolumes = await page.evaluate(() => {
                const results: Array<{ symbol: string; volume: number }> = [];
                const rows = Array.from(document.querySelectorAll('table tbody tr'));

                for (const row of rows) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length < 3) continue;

                    const symbol = cells[0]?.querySelector('p')?.textContent?.trim();
                    if (!symbol) continue;

                    const rawVolume = cells[2]?.querySelector('p')?.textContent?.trim();
                    if (!rawVolume) continue;

                    const cleaned = rawVolume.replace(/[$,\s]/g, '');
                    const volume = parseFloat(cleaned);
                    if (!isNaN(volume)) {
                        results.push({ symbol, volume });
                    }
                }
                return results;
            });

            for (const { symbol, volume } of pageVolumes) {
                volumes.set(symbol, volume);
            }

            // Try next page
            await page.evaluate(() =>
                window.scrollTo(0, document.body.scrollHeight),
            );
            await page.waitForTimeout(500);

            const nextBtn = await page.$('button:has-text("Next")');
            if (!nextBtn) break;

            const isDisabled = await nextBtn.isDisabled();
            if (isDisabled) break;

            await nextBtn.click();
            pageNum++;
            await page.waitForTimeout(2_500);
        }

        logger.log(`✅ Scraped volumes for ${volumes.size} pools`);
    } catch (error) {
        logger.warn(
            `⚠️ Volume scrape failed (graceful fallback): ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
        if (browser) await browser.close();
    }

    return volumes;
}
