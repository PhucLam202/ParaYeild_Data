# 🔵 Polkadot DeFi Backtesting Engine

> A multi-chain DeFi data indexer and backtesting engine for the Polkadot ecosystem — inspired by DeFiLlama's simulation tools.

---

## 🎯 Vision

This project indexes **historical on-chain data** from Polkadot DeFi parachains (Bifrost, Acala, Hydration) and provides a **backtesting engine** to simulate and optimize complex, multi-chain DeFi strategies including:

- **APY simulation** across vStaking, Farming, and Lending pools
- **Impermanent Loss** calculation for liquidity positions
- **XCM cross-chain fee accounting** for multi-hop strategies
- **Portfolio optimization** across multiple protocols simultaneously

---

## 🧠 Core Concept

```
┌──────────────────────────────────────────────┐
│             Data Layer (Crawlers)             │
│  Bifrost · Acala · Hydration · Moonwell       │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│              MongoDB (Per-Protocol DB)        │
│  bifrost-db · acala-db · hydration-db        │
└──────────────────┬───────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────┐
│           Backtesting Engine                  │
│  Strategy → Simulate → Score → Optimize       │
└──────────────────────────────────────────────┘
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 20 + TypeScript |
| **Framework** | NestJS 10 |
| **Web Crawler** | Playwright (headless Chromium) + Cheerio |
| **HTTP Crawling** | Native `fetch` (direct API calls) |
| **Database** | MongoDB (one main DB + one per crawling app) |
| **ORM** | TypeORM (MongoDB driver) |
| **Config** | YAML-based pool config (`config/pools.yaml`) |
| **Logging** | Winston + file output to `logs/` |
| **Package Manager** | pnpm |

---

## 📐 Project Structure

```
Polkadot/
├── config/
│   └── pools.yaml                  # Protocol/network/pool token config (NO code changes needed to add pools)
│
├── src/
│   ├── app.module.ts               # Root module (imports all crawlers + shared)
│   ├── main.ts                     # NestJS bootstrap
│   │
│   └── modules/
│       ├── bifrost/                # Bifrost protocol module
│       │   ├── bifrost.module.ts
│       │   ├── bifrost.controller.ts
│       │   ├── bifrost.service.ts
│       │   ├── crawlers/
│       │   │   ├── base.crawler.ts     # Abstract crawler with Playwright + retry logic
│       │   │   ├── vstaking.crawler.ts # Direct API: dapi.bifrost.io/api/omni/{TOKEN}
│       │   │   └── farming.crawler.ts  # Direct API: dapi.bifrost.io/api/...
│       │   └── services/
│       │       └── pool-config.service.ts  # Reads pools.yaml
│       │
│       ├── acala/                  # [PLANNED] Acala/Karura lending & DEX
│       ├── hydration/              # [PLANNED] HydraDX / OmniPool
│       ├── moonwell/               # [PLANNED] Moonwell lending (Moonbeam)
│       ├── stellaswap/             # [PLANNED] StellaSwap DEX (Moonbeam)
│       └── backtest/               # [PLANNED] Backtesting engine
│
├── logs/
│   └── bifrost/
│       ├── vstaking-*.json
│       ├── farming-*.json
│       └── screenshots/
│
├── .agent/
│   ├── skills/
│   │   └── polkadot-defi/          # AI assistant skill for this project
│   └── workflows/
│
└── docs/
    └── db-design.md                # Entity & DB schema documentation
```

---

## 🗄️ Database Design

### Architecture: Multi-Database per Protocol

```
MongoDB Atlas / Local
├── main-db                    # Global metadata, strategies, simulation results
│   ├── strategies
│   ├── simulations
│   ├── xcm_fee_logs
│   └── scheduler_state
│
├── bifrost-db                 # Bifrost-specific crawled data
│   ├── vstaking_history
│   └── farming_history
│
├── acala-db                   # [PLANNED]
│   ├── lending_history
│   └── dex_pool_history
│
├── hydration-db               # [PLANNED]
│   └── omnipool_history
│
└── moonwell-db                # [PLANNED]
    └── lending_history
```

### Key Entities (TypeORM + MongoDB)

**`VStakingHistory`** (bifrost-db)
```typescript
{
  _id: ObjectId,
  token: string,          // e.g. "vDOT", "vETH"
  network: string,        // "polkadot" | "kusama"
  date: number,           // Unix timestamp (from Bifrost API)
  avgApy: number,         // Average APY %
  weekApy: number,        // 7-day APY %
  monthApy: number,       // 30-day APY %
  quarterApy: number,     // 90-day APY %
  crawledAt: Date,        // When we indexed it
}
```

**`FarmingHistory`** (bifrost-db)
```typescript
{
  _id: ObjectId,
  poolId: string,         // e.g. "vDOT-DOT"
  token: string,
  network: string,
  apy: number,            // Latest APY (volatile)
  tvl: number,            // Total Value Locked (USD)
  timestamp: Date,        // Crawl timestamp
}
```

**`Strategy`** (main-db)
```typescript
{
  _id: ObjectId,
  name: string,
  description: string,
  chains: string[],       // ["bifrost", "hydration"]
  allocations: [{
    protocol: string,
    pool: string,
    weight: number,       // 0..1
  }],
  createdAt: Date,
}
```

**`Simulation`** (main-db)
```typescript
{
  _id: ObjectId,
  strategyId: ObjectId,
  startDate: Date,
  endDate: Date,
  initialCapital: number,
  results: {
    finalValue: number,
    totalReturn: number,
    annualizedApy: number,
    maxDrawdown: number,
    impermanentLoss: number,
    xcmFeesTotal: number,
    sharpeRatio: number,
  },
  createdAt: Date,
}
```

See [`docs/db-design.md`](./docs/db-design.md) for full entity diagrams.

---

## 🔌 API Endpoints

Base URL: `http://localhost:3000`

### Bifrost Module
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/bifrost/crawl/vstaking` | Crawl current vStaking APY history |
| `GET` | `/bifrost/crawl/farming` | Crawl current farming APY |
| `GET` | `/bifrost/crawl/all` | Crawl all Bifrost pools |

### (Planned)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/backtest/simulate` | Run a strategy backtest |
| `GET` | `/backtest/strategies` | List saved strategies |
| `GET` | `/data/bifrost/vstaking/{token}` | Get historical APY for a token |

---

## ⚙️ Configuration

### Pool Config (`config/pools.yaml`)
Add new protocols/networks/tokens **without changing any code**:

```yaml
bifrost:
  polkadot:
    vstaking:
      tokens: [vDOT, vETH, vASTR, vMANTA, vBNC, vGLMR, vPHA, vFIL]
    farming:
      tokens: [vDOT, vETH, ...]
  kusama:
    vstaking:
      tokens: [vKSM, vBNC, vMOVR]
```

### Environment Variables (`.env`)
```env
# MongoDB
MONGODB_MAIN_URI=mongodb://localhost:27017/polkadot-defi-main
MONGODB_BIFROST_URI=mongodb://localhost:27017/polkadot-defi-bifrost
MONGODB_ACALA_URI=mongodb://localhost:27017/polkadot-defi-acala

# App
PORT=3000
NODE_ENV=development
```

---

## 🚀 Running the App

```bash
# Install dependencies
pnpm install

# Development (hot reload)
pnpm run start:dev

# Production
pnpm run build && pnpm run start:prod
```

---

## 📅 Roadmap

### ✅ Phase 1 — Bifrost Data Crawler (Done)
- [x] NestJS project scaffold
- [x] `BaseCrawler` with Playwright + retry + Cheerio
- [x] `VStakingCrawler` — historical APY via `dapi.bifrost.io` API
- [x] `FarmingCrawler` — latest APY via `dapi.bifrost.io` API
- [x] YAML-based pool config (no code changes to add tokens)
- [x] File-based log output (`logs/bifrost/*.json`)

### 🔄 Phase 2 — Database Layer (In Progress)
- [ ] TypeORM + MongoDB setup (multi-database)
- [ ] `VStakingHistory` entity + repository
- [ ] `FarmingHistory` entity + repository
- [ ] Scheduler: auto-crawl every 6 hours
- [ ] Deduplication by (token, date)

### 🔲 Phase 3 — Multi-Protocol Crawlers
- [ ] Acala lending (aToken APY, borrow rate)
- [ ] Hydration OmniPool (liquidity, APY)
- [ ] Moonwell lending (Moonbeam)
- [ ] StellaSwap DEX pools (Moonbeam)

### 🔲 Phase 4 — Backtesting Engine
- [ ] Strategy definition schema
- [ ] APY simulator (time-series replay)
- [ ] Impermanent loss calculator
- [ ] XCM fee model (per-hop, per-asset)
- [ ] Portfolio optimizer (Sharpe ratio maximizer)
- [ ] REST API for strategy creation & simulation

### 🔲 Phase 5 — Analytics Dashboard
- [ ] Historical APY charts per token/pool
- [ ] Strategy comparison view
- [ ] Simulation result explorer

---

## 🧱 Architecture Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| One DB per crawler | ✅ Yes | Isolation, independent scaling |
| API over scraping | ✅ Preferred | More reliable; fall back to Playwright for JS-heavy pages |
| YAML pool config | ✅ Yes | Non-developer can add tokens without code changes |
| TypeORM for MongoDB | ✅ Yes | Consistent ORM across SQL/NoSQL if we add Postgres later |
| Playwright base class | ✅ Yes | Fallback for pages without public APIs |

---

## 📁 Related Docs

- [`docs/db-design.md`](./docs/db-design.md) — Full entity diagram & schema
- [`config/pools.yaml`](./config/pools.yaml) — Pool token configuration
- [`.agent/skills/polkadot-defi/SKILL.md`](./.agent/skills/polkadot-defi/SKILL.md) — AI assistant context for this project
