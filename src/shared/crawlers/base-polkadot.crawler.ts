import { Logger, OnModuleDestroy } from '@nestjs/common';
import { CrawlResult } from './base-api.crawler';
import { ProtocolSnapshot } from '../entities/protocol-snapshot.entity';

/**
 * BasePolkadotCrawler — Abstract base for Polkadot parachain RPC crawlers.
 *
 * Use this when you need to query on-chain state directly via Polkadot.js API,
 * for example: reading pallet storage, subscribing to events, or decoding SCALE types.
 *
 * Supported connections (configure via `wsUrl`):
 *   - Bifrost:    wss://bifrost-rpc.dwellir.com
 *   - Acala:      wss://acala-rpc-0.aca-api.network
 *   - Hydration:  wss://rpc.hydradx.cloud
 *   - Astar:      wss://astar.api.onfinality.io/public-ws
 *   - Moonbeam:   wss://wss.api.moonbeam.network
 *   - Polkadot:   wss://rpc.polkadot.io
 *   - Kusama:     wss://kusama-rpc.polkadot.io
 *
 * ## To activate:
 * ```bash
 * pnpm add @polkadot/api @polkadot/types
 * ```
 *
 * Then uncomment the imports and implementation below.
 *
 * ## Example subclass:
 * ```typescript
 * @Injectable()
 * export class BifrostOnChainCrawler extends BasePolkadotCrawler<MyData> {
 *   protected readonly logger = new Logger(BifrostOnChainCrawler.name);
 *   protected readonly protocol = Protocol.BIFROST;
 *   protected readonly network = Network.POLKADOT;
 *   protected readonly poolType = PoolType.VSTAKING;
 *   protected readonly wsUrl = 'wss://bifrost-rpc.dwellir.com';
 *
 *   protected async queryChain(api: ApiPromise): Promise<MyData[]> {
 *     const entries = await api.query.vtokenMinting.tokenPool.entries();
 *     return entries.map(([key, value]) => ({ key: key.args[0].toString(), value }));
 *   }
 *
 *   protected toSnapshot(raw: MyData): ProtocolSnapshot {
 *     return { protocol: this.protocol, ... };
 *   }
 * }
 * ```
 */

// ─── Uncomment when @polkadot/api is installed ───────────────────────────────
// import { ApiPromise, WsProvider } from '@polkadot/api';

// export abstract class BasePolkadotCrawler<TRaw> implements OnModuleDestroy {
//   protected abstract readonly logger: Logger;
//   protected abstract readonly protocol: string;
//   protected abstract readonly network: string;
//   protected abstract readonly poolType: string;
//   protected abstract readonly wsUrl: string;
//
//   private api: ApiPromise | null = null;
//
//   protected async getApi(): Promise<ApiPromise> {
//     if (this.api && this.api.isConnected) return this.api;
//     const provider = new WsProvider(this.wsUrl);
//     this.api = await ApiPromise.create({ provider });
//     this.logger.log(`🔗 Connected to ${this.wsUrl}`);
//     return this.api;
//   }
//
//   /** Query the chain and return raw typed data. */
//   protected abstract queryChain(api: ApiPromise): Promise<TRaw[]>;
//
//   /** Map raw chain data to unified ProtocolSnapshot. */
//   protected abstract toSnapshot(raw: TRaw): ProtocolSnapshot;
//
//   async crawl(): Promise<CrawlResult<ProtocolSnapshot>> {
//     const startTime = Date.now();
//     this.logger.log(`⛓️ [${this.protocol}/${this.network}] Connecting to ${this.wsUrl}`);
//
//     const api = await this.getApi();
//     const raw = await this.queryChain(api);
//     const data = raw.map((item) => this.toSnapshot(item));
//     const duration = Date.now() - startTime;
//
//     this.logger.log(`✅ On-chain crawl done in ${duration}ms — ${data.length} items`);
//
//     return {
//       protocol: this.protocol,
//       network: this.network,
//       poolType: this.poolType,
//       timestamp: new Date().toISOString(),
//       duration,
//       itemsFound: data.length,
//       data,
//     };
//   }
//
//   async onModuleDestroy() {
//     if (this.api) {
//       await this.api.disconnect();
//       this.logger.log(`🔌 Disconnected from ${this.wsUrl}`);
//     }
//   }
// }
// ─────────────────────────────────────────────────────────────────────────────

// Placeholder export so this file compiles before the package is installed.
export abstract class BasePolkadotCrawler<TRaw> {
    protected abstract readonly logger: Logger;
    protected abstract readonly protocol: string;
    protected abstract readonly network: string;
    protected abstract readonly poolType: string;

    /** WSS URL of the Polkadot-compatible RPC endpoint. */
    protected abstract readonly wsUrl: string;

    abstract crawl(): Promise<CrawlResult<ProtocolSnapshot>>;
}
