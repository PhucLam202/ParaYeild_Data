/**
 * Seed script: inserts 30 days of historical Bifrost farming snapshots into MongoDB.
 * Pools: 9 pools × 30 days = 270 documents (upserted, safe to re-run).
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-bifrost-farming.ts
 */

import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// ─── Pool Definitions ────────────────────────────────────────────────────────

interface PoolDef {
    assetSymbol: string;
    poolType: string;
    baseApy: number;
    tvlUsd: number;
    status: 'active' | 'ended';
    apyRange?: { min: number; max: number };
}

const POOLS: PoolDef[] = [
    { assetSymbol: 'MANTA-vMANTA',       poolType: 'blp_farm',        baseApy: 21.01, tvlUsd: 3_719,     status: 'active' },
    { assetSymbol: 'BNC-USDT',           poolType: 'lp_farm',         baseApy: 19.37, tvlUsd: 4_796,     status: 'active' },
    { assetSymbol: 'DOT-vDOT',           poolType: 'blp_farm',        baseApy: 13.03, tvlUsd: 1_276_400, status: 'active' },
    { assetSymbol: 'ASTR-vASTR',         poolType: 'blp_farm',        baseApy: 12.03, tvlUsd: 8_118,     status: 'active' },
    { assetSymbol: 'BNC-vBNC',           poolType: 'blp_farm',        baseApy: 11.12, tvlUsd: 16_571,    status: 'active' },
    { assetSymbol: 'vDOT-USDT',          poolType: 'lp_farm',         baseApy: 10.25, tvlUsd: 17_224,    status: 'active' },
    { assetSymbol: 'vDOT',               poolType: 'single_farming',  baseApy: 5.08,  tvlUsd: 758_408,   status: 'active', apyRange: { min: 0.28, max: 5.08 } },
    { assetSymbol: 'FIL-vFIL',           poolType: 'lp_farm',         baseApy: 0,     tvlUsd: 30,        status: 'ended' },
    { assetSymbol: 'MANTA-vMANTA-ended', poolType: 'blp_farm',        baseApy: 0,     tvlUsd: 0,         status: 'ended' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function varyApy(baseApy: number): number {
    if (baseApy === 0) return 0;
    return baseApy * (1 + (Math.random() * 0.10 - 0.05)); // ×[0.95, 1.05]
}

function buildDocument(pool: PoolDef, snapshotDate: string, dayMidnight: Date, now: Date) {
    const metadata: Record<string, unknown> = {
        baseApy: pool.baseApy,
        source: 'manual_seed',
        poolKind: pool.poolType,
        status: pool.status,
    };
    if (pool.apyRange) {
        metadata.apyRange = pool.apyRange;
    }

    return {
        protocol: 'bifrost',
        network: 'bifrost',
        poolType: pool.poolType,
        assetSymbol: pool.assetSymbol,
        snapshotDate,
        supplyApy: varyApy(pool.baseApy),
        tvlUsd: pool.tvlUsd,
        dataTimestamp: dayMidnight,
        crawledAt: now,
        updatedAt: now,
        metadata,
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('ERROR: MONGODB_URI is not set in .env');
        process.exit(1);
    }

    const client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('bifrost_snapshots');

    const now = new Date();
    const today = new Date();
    let upserted = 0;

    for (let i = 29; i >= 0; i--) {
        const d = new Date(Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate() - i,
        ));
        const snapshotDate = d.toISOString().slice(0, 10); // "YYYY-MM-DD"

        for (const pool of POOLS) {
            const doc = buildDocument(pool, snapshotDate, d, now);

            await collection.updateOne(
                {
                    network: doc.network,
                    poolType: doc.poolType,
                    assetSymbol: doc.assetSymbol,
                    snapshotDate: doc.snapshotDate,
                },
                { $set: doc },
                { upsert: true },
            );
            upserted++;
        }
    }

    await client.close();
    console.log(`Done: ${upserted} documents upserted`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
