export interface RiskInput {
    tvlUsd?: number;
    apyVolatility?: number;
    totalApy?: number;
    poolType?: string;
}

export interface RiskResult {
    riskScore: number;
    riskLabel: 'Low' | 'Medium' | 'High';
}

function tvlScore(tvl?: number): number {
    if (tvl == null) return 5;
    if (tvl >= 10_000_000) return 0;
    if (tvl >= 1_000_000) return 2;
    if (tvl >= 100_000) return 5;
    return 8;
}

function volatilityScore(stddev?: number): number {
    if (stddev == null) return 5;
    return Math.min(10, stddev / 2);
}

function apyScore(apy?: number): number {
    if (apy == null) return 0;
    if (apy <= 20) return 0;
    if (apy <= 50) return 3;
    if (apy <= 100) return 6;
    return 9;
}

const POOL_TYPE_RISK: Record<string, number> = {
    staking: 1,
    vstaking: 1,
    lending: 2,
    farming: 5,
    dex: 6,
};

function poolTypeScore(poolType?: string): number {
    if (!poolType) return 4;
    return POOL_TYPE_RISK[poolType] ?? 4;
}

export function calculateRiskScore(input: RiskInput): RiskResult {
    const weighted =
        tvlScore(input.tvlUsd) * 0.35 +
        volatilityScore(input.apyVolatility) * 0.25 +
        apyScore(input.totalApy) * 0.25 +
        poolTypeScore(input.poolType) * 0.15;

    const riskScore = Math.max(1, Math.min(10, Math.round(weighted)));
    const riskLabel: RiskResult['riskLabel'] =
        riskScore <= 3 ? 'Low' : riskScore <= 6 ? 'Medium' : 'High';

    return { riskScore, riskLabel };
}
