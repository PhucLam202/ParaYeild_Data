# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Development (hot reload)
pnpm run start:dev

# Build
pnpm run build

# Production
pnpm run start:prod

# Lint (auto-fix)
pnpm run lint

# Format
pnpm run format

# Tests
pnpm test                    # all tests
pnpm run test:watch          # watch mode
pnpm run test:cov            # with coverage
pnpm run test:e2e            # end-to-end
```

## Environment

Copy `.env` and set:
```env
MONGODB_URI=mongodb://localhost:27017/polkadot-defi-main
PORT=3000
NODE_ENV=development
```

## Architecture

This is a **NestJS 10 + TypeScript** application that crawls DeFi protocol data from the Polkadot ecosystem and exposes it via REST APIs for a backtesting engine.

### Data Flow

```
config/pools.yaml → Protocol Crawlers → MongoDB (upsert) → /pools API
                                      ↑
                         SnapshotScheduler (every 10 min)
```

### Module Structure

- **`src/shared/`** — Globally provided infrastructure:
  - `crawlers/base-api.crawler.ts` — Abstract base for REST API crawlers (preferred). Implement `fetchRaw()` and `toSnapshot()`.
  - `crawlers/base.crawler.ts` — Abstract base for Playwright (headless browser) crawlers. Use only when no public API exists.
  - `entities/protocol-snapshot.entity.ts` — `BaseProtocolSnapshot` abstract class + protocol-specific subclasses (`BifrostSnapshot`, `MoonwellSnapshot`, `HydrationSnapshot`). All crawlers map to this unified shape.
  - `services/pool-config.service.ts` — Reads `config/pools.yaml` at startup. Use `poolConfig.getTokens(protocol, network, poolType)` or `poolConfig.get(...)`.

- **`src/modules/bifrost/`**, **`moonwell/`**, **`hydration/`** — Per-protocol modules. Each has:
  - One or more crawlers under `crawlers/` that extend `BaseApiCrawler` or `BaseCrawler`
  - A service that calls crawlers and upserts results into MongoDB
  - A controller exposing manual crawl endpoints (`GET /bifrost/crawl/all`, etc.)

- **`src/modules/pools/`** — Aggregated read-only API for the simulation engine. `PoolsService` queries all three protocol repositories and returns `PoolSummary[]`. Uses MongoDB aggregation pipelines for `fetchLatestSnapshots()` and a 5-minute in-memory TTL cache for metadata endpoints.

- **`src/modules/scheduler/`** — `SnapshotSchedulerService` runs `@Cron('0 */10 * * * *')` to trigger `crawlAll()` on every protocol in parallel.

### Key Design Decisions

**Upsert strategy**: One MongoDB document per `(network, poolType, assetSymbol, snapshotDate)` per UTC day. The cron overwrites the same document every 10 minutes within the day; after midnight UTC, `snapshotDate` advances and a fresh document is created. `getUtcDateKey()` in `src/shared/utils/date.util.ts` produces the `"YYYY-MM-DD"` key.

**Single database**: All protocol snapshots share one MongoDB connection (`MONGODB_URI`) but live in separate collections (`bifrost_snapshots`, `moonwell_snapshots`, `hydration_snapshots`). TypeORM `synchronize: true` is enabled (development only).

**No-code token config**: Adding tokens or pools requires only editing `config/pools.yaml` — no TypeScript changes needed.

### Adding a New Protocol Crawler

1. Create `src/modules/{protocol}/crawlers/{name}.crawler.ts` extending `BaseApiCrawler<TRaw>`.
2. Implement `fetchRaw()` (fetch from external API) and `toSnapshot(raw)` (map to `ProtocolSnapshot`).
3. Add a `{Protocol}Snapshot` entity subclass in `protocol-snapshot.entity.ts` with `@Entity('{protocol}_snapshots')`.
4. Create the module, service (with upsert logic mirroring `BifrostService`), and controller.
5. Register the new entity in `AppModule`'s TypeORM config and add the collection to `PoolsService.selectSources()`.
6. Add the crawler to `SnapshotSchedulerService.runScheduledCrawl()`.
7. Add protocol/network/pool config to `config/pools.yaml`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/pools` | Latest snapshot per pool (filterable by protocol, asset, poolType, network, minApy) |
| `GET` | `/pools/top` | Top-N pools by sort field |
| `GET` | `/pools/history` | Historical daily snapshots (filterable by date range) |
| `GET` | `/pools/parachains` | Distinct networks with active protocols |
| `GET` | `/pools/protocol-types` | Distinct pool types with labels |
| `GET` | `/pools/tokens` | Distinct asset symbols with protocol/network coverage |
| `GET` | `/bifrost/crawl/all` | Manually trigger Bifrost crawl |
| `GET` | `/moonwell/crawl/markets` | Manually trigger Moonwell crawl |
| `GET` | `/hydration/crawl/pools` | Manually trigger Hydration crawl |
