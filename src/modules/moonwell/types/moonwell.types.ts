/**
 * Moonwell SDK types and configuration.
 *
 * Source: @moonwell-fi/moonwell-sdk
 * SDK always returns decimal values (e.g. 0.05 = 5%).
 */

// ─── Raw SDK Market (fields we use from the SDK's Market type) ──────────────

export interface RawMoonwellSdkMarket {
    marketKey: string;
    chainId: number;
    deprecated: boolean;

    underlyingToken: {
        address: string;
        symbol: string;
        name: string;
        decimals: number;
    };

    underlyingPrice: number;

    // Supply
    totalSupply: number;
    totalSupplyUsd: number;
    baseSupplyApy: number;       // decimal (0.05 = 5%)
    totalSupplyApr: number;      // decimal, includes base + all rewards

    // Borrow
    totalBorrows: number;
    totalBorrowsUsd: number;
    baseBorrowApy: number;       // decimal
    totalBorrowApr: number;      // decimal

    // Risk
    collateralFactor: number;    // decimal (0-1)
    reserveFactor: number;       // decimal (0-1)

    // Rewards
    rewards: Array<{
        token: { symbol: string; address: string };
        supplyApr: number;       // decimal
        borrowApr: number;       // decimal
        liquidStakingApr?: number;
    }>;

    // Market token
    marketToken: {
        address: string;
        symbol: string;
    };
}

// ─── Chain / Network mapping ────────────────────────────────────────────────

/**
 * Maps Moonwell chainId → canonical network string used in ProtocolSnapshot.
 */
export const MOONWELL_CHAIN_NETWORK: Record<number, string> = {
    1284: 'moonbeam',
    8453: 'base',
    10: 'optimism',
};

// ─── RPC Configuration ─────────────────────────────────────────────────────

export const MOONWELL_RPC_CONFIG = {
    moonbeam: {
        rpcUrls: ['https://rpc.api.moonbeam.network'],
    },
    base: {
        rpcUrls: ['https://mainnet.base.org'],
    },
    optimism: {
        rpcUrls: ['https://mainnet.optimism.io'],
    },
};
