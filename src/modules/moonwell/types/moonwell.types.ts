/**
 * Moonwell API response types.
 *
 * Sources:
 *   - Moonwell SDK: https://sdk.moonwell.fi/docs/glossary/types#market
 *   - REST API: https://ponder.moonwell.fi
 *
 * Note: The Ponder REST API returns snake_case fields; the SDK wraps
 * them into camelCase. These types model the SDK's Market shape to keep
 * things idiomatic in TypeScript.
 */

// ─── Token Info ───────────────────────────────────────────────────────────────

export interface MoonwellToken {
    address: string;
    chainId: number;
    decimals: number;
    symbol: string;
    name: string;
    price: number; // USD price
    priceUsd?: number;
}

// ─── Market Reward ────────────────────────────────────────────────────────────

export interface MoonwellReward {
    token: MoonwellToken;
    supplyApr: number; // % APR from rewards on supply side
    borrowApr: number; // % APR from rewards on borrow side
}

// ─── Raw Market (as returned by Moonwell SDK / Ponder API) ────────────────────

/**
 * Raw market data from `getMarkets()` (Moonwell SDK) or
 * the Ponder REST API `GET /markets`.
 *
 * We intentionally keep only the fields we need for ProtocolSnapshot.
 * See: https://github.com/moonwell-fi/moonwell-sdk/blob/main/src/types/market.ts
 */
export interface MoonwellMarket {
    marketKey: string;          // unique key: e.g. 'USDC-moonbeam'
    chainId: number;            // 1284 = Moonbeam, 8453 = Base
    underlyingToken: MoonwellToken;
    mToken: MoonwellToken;      // mToken (share token, e.g. mUSDC)

    // ── Supply ────────────────────────────────────────────────────────────────
    totalSupply: number;        // Total supply in underlying token units
    totalSupplyUsd: number;     // Total supply in USD
    baseSupplyApy: number;      // Base supply APY % (from interest rate model)

    // ── Borrow ────────────────────────────────────────────────────────────────
    totalBorrows: number;
    totalBorrowsUsd: number;
    baseBorrowApy: number;      // Base borrow APY %
    utilizationRate: number;    // 0–1 (e.g. 0.63 = 63% utilization)

    // ── Risk Parameters ────────────────────────────────────────────────────────
    collateralFactor: number;   // 0–1, also called LTV in other protocols
    reserveFactor: number;

    // ── Rewards ───────────────────────────────────────────────────────────────
    rewards: MoonwellReward[];

    // ── Status ────────────────────────────────────────────────────────────────
    mintPaused: boolean;
    borrowPaused: boolean;
    seizePaused: boolean;
}

// ─── Chain / Network mapping ──────────────────────────────────────────────────

/**
 * Maps Moonwell chainId → canonical network string used in ProtocolSnapshot.
 */
export const MOONWELL_CHAIN_NETWORK: Record<number, string> = {
    1284: 'moonbeam',
    8453: 'base',
};
