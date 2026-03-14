export const PROTOCOL_LOGOS: Record<string, string> = {
    bifrost: '/logos/protocols/bifrost.svg',
    moonwell: '/logos/protocols/moonwell.svg',
    hydration: '/logos/protocols/hydration.svg',
};

export const TOKEN_ICONS: Record<string, string> = {
    DOT: '/logos/tokens/dot.svg',
    KSM: '/logos/tokens/ksm.svg',
    ETH: '/logos/tokens/eth.svg',
    GLMR: '/logos/tokens/glmr.svg',
    ASTR: '/logos/tokens/astr.svg',
    MOVR: '/logos/tokens/movr.svg',
    BNC: '/logos/tokens/bnc.svg',
    MANTA: '/logos/tokens/manta.svg',
    PHA: '/logos/tokens/pha.svg',
    FIL: '/logos/tokens/fil.svg',
    WELL: '/logos/tokens/well.svg',
    USDC: '/logos/tokens/usdc.svg',
    xcDOT: '/logos/tokens/dot.svg',
    xcUSDT: '/logos/tokens/usdt.svg',
    FRAX: '/logos/tokens/frax.svg',
};

export function getProtocolLogo(protocol: string): string | undefined {
    return PROTOCOL_LOGOS[protocol.toLowerCase()];
}

export function getTokenIcon(symbol: string): string | undefined {
    return TOKEN_ICONS[symbol] ?? TOKEN_ICONS[symbol.replace(/^v/, '')];
}
