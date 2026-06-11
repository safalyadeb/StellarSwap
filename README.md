# StellarSwap

> A production-grade, Uniswap V2-inspired AMM DEX built on **Stellar** using **Soroban** smart contracts — with a full TypeScript SDK, real-time indexer, and a mobile-responsive Next.js interface.

[![Test Suite](https://github.com/safalyadeb/StellarSwap/actions/workflows/test.yml/badge.svg)](https://github.com/safalyadeb/StellarSwap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Network](https://img.shields.io/badge/network-Stellar%20Testnet-7B61FF.svg)](https://stellar.expert/explorer/testnet)

**Live demo:** **https://frontend-safalyadeb1.vercel.app**
**Network:** Stellar Testnet · **Contracts:** [deployed & verified ↓](#-deployment--on-chain-proof)

---

## Table of Contents

1. [What is StellarSwap?](#what-is-stellarswap)
2. [How each requirement is met](#-how-each-requirement-is-met)
3. [Architecture](#-architecture)
4. [Repository structure](#-repository-structure)
5. [Quick start](#-quick-start)
6. [Testing](#-testing)
7. [CI/CD](#-cicd)
8. [Deployment & on-chain proof](#-deployment--on-chain-proof)
9. [Screenshots](#-screenshots)
10. [The AMM math](#-the-amm-math)
11. [Security](#-security)
12. [License](#-license)

---

## What is StellarSwap?

StellarSwap is a decentralized exchange (DEX) for the Stellar blockchain. It implements a constant-product Automated Market Maker (AMM) — the same model that powers Uniswap V2 — rebuilt from first principles for Soroban's execution environment and `i128` arithmetic.

**Key features**

- Permissionless liquidity pools for any token pair
- LP tokens with embedded fee accrual (0.3% per swap, paid to LPs)
- Multi-hop routing (A → B → C through intermediate pools)
- Slippage protection (`amount_out_min` / `amount_in_max`) and deadline validation
- Real-time pool data & price updates via a Horizon event indexer
- A TypeScript SDK that mirrors the on-chain math exactly (BigInt)
- A mobile-first Next.js UI with Freighter wallet integration

---

## ✅ How each requirement is met

| Requirement | Where it lives | Notes |
|---|---|---|
| **Advanced smart contract development** | `contracts/{factory,pair,router,token,shared}` | Constant-product AMM, embedded LP tokens, `x*y=k` invariant, checked `i128` arithmetic |
| **Inter-contract communication** | `contracts/router` → `contracts/factory` → `contracts/pair` → token SACs | Router resolves pairs via Factory and invokes Pair/token contracts cross-contract |
| **Event streaming & real-time updates** | `indexer/` + `frontend/src/hooks/usePoolData.ts` | Horizon SSE event indexer → Postgres → REST API; frontend polls live reserves for instant quotes |
| **CI/CD pipeline setup** | `.github/workflows/test.yml` | 5 jobs: Rust tests + clippy + fmt, property tests, coverage, SDK tests, frontend tests + build |
| **Smart contract deployment workflow** | `scripts/deploy/` + [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Scripted build → upload WASM → deploy → create pairs → seed liquidity |
| **Mobile responsive frontend** | `frontend/` (Tailwind, `sm:` breakpoints) | Mobile-first layout; collapsible nav, responsive swap/pool widgets |
| **Error handling & loading states** | `frontend/src/context/ToastContext.tsx`, `components/ui/Spinner.tsx`, `SwapWidget.tsx` | Toast errors, per-phase swap status, disabled-button states, insufficient-balance/liquidity guards |
| **Tests for contracts and frontend** | `contracts/integration`, `sdk/typescript/tests`, `frontend/src/lib/__tests__` | **103 passing tests** across all three layers (see [Testing](#-testing)) |
| **Production-ready architecture** | monorepo: contracts / sdk / indexer / frontend / infra | Immutable pairs, stateless router, shared math crate, single source of truth for config |
| **Documentation & demo presentation** | this README + [`docs/`](docs/) | Architecture, security, testing, deployment, roadmap, and PRD docs |

---

## 🏗 Architecture

```
                         ┌──────────────────┐
        create_pair ───► │  Factory         │  Pool registry; deploys Pair
                         │  (admin-gated)   │  contracts from a stored WASM hash
                         └────────┬─────────┘
                                  │ deploys
                                  ▼
   ┌──────────────┐  swap   ┌──────────────────┐   transfer   ┌──────────────┐
   │  Router      │ ──────► │  Pair            │ ───────────► │ Token (SAC / │
   │  (stateless) │         │  AMM core        │              │  SEP-41)     │
   │  multi-hop   │ ◄────── │  x*y=k invariant │ ◄─────────── │              │
   └──────────────┘ amounts │  LP token logic  │   transfer   └──────────────┘
                            └────────┬─────────┘
                                     │ emits events
                                     ▼
                         ┌──────────────────┐    REST    ┌──────────────┐
                         │  Indexer         │ ─────────► │  Frontend    │
                         │  Horizon SSE →   │  /pools    │  Next.js UI  │
                         │  Postgres        │  /swaps    │  + Freighter │
                         └──────────────────┘            └──────────────┘
```

**Design principles**

- **Immutable pairs** — Pair contracts have no admin and no upgrade path.
- **Stateless router** — all routing state lives in Factory + Pairs; the router only computes and orchestrates.
- **One shared math crate** — `contracts/shared` is the single source of truth; the TS SDK and frontend mirror it exactly and are regression-tested against the same vectors.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for full data-flow diagrams.

---

## 📁 Repository structure

```
StellarSwap/
├── contracts/          # Soroban smart contracts (Rust)
│   ├── shared/         # AMM math, errors, shared interfaces/types
│   ├── factory/        # Pool registry + pair deployer
│   ├── pair/           # AMM core + embedded LP tokens
│   ├── router/         # Stateless multi-hop swap router
│   ├── token/          # Reference SEP-41 token (for tests/seeding)
│   └── integration/    # Cross-contract integration tests (+ snapshots)
├── sdk/typescript/     # TypeScript SDK (factory/pair/router clients + math)
├── frontend/           # Next.js 14 swap UI (App Router + Tailwind + Freighter)
├── indexer/            # Horizon SSE event indexer + REST analytics API
├── scripts/deploy/     # Deployment & liquidity-seeding scripts
├── infra/              # Docker Compose (Stellar node + Postgres), Postgres schema
├── config/             # Per-network contract addresses (source of truth)
└── docs/               # Architecture, security, testing, deployment, roadmap, PRD
```

---

## 🚀 Quick start

### Prerequisites

```bash
# Rust + WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Node.js 20+
nvm install 20
```

### Build & test the contracts

```bash
cargo build --workspace --target wasm32v1-none --release
cargo test --workspace        # 59 Rust tests
```

### Run the frontend locally

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

Connect [Freighter](https://www.freighter.app/) (set to **Testnet**) to swap against the live deployed pools.

### Local full-stack (optional)

```bash
docker-compose -f infra/docker/docker-compose.yml up -d   # Stellar node + Postgres
NETWORK=local ./scripts/deploy/deploy_all.sh
```

---

## 🧪 Testing

**103 passing tests** across all three layers. Run them all:

```bash
cargo test --workspace                       # Rust contracts
cd sdk/typescript && npm install && npm test # TypeScript SDK
cd frontend        && npm install && npm test # Frontend
```

| Layer | Tests | What's covered |
|---|---:|---|
| **Rust — unit** (`shared`, `pair`, `router`, `token`, `factory`) | 28 | AMM math, sqrt invariants, fee accuracy, LP formulas, checked arithmetic |
| **Rust — integration** (`contracts/integration`) | 31 | Factory lifecycle, pair invariants (`k` never decreases over 50 swaps), LP mint/burn, fee accrual, reserve consistency, panics on edge cases — all snapshot-verified |
| **TypeScript SDK** (`sdk/typescript/tests`) | 17 | `getAmountOut`/`getAmountIn` match Rust output, LP math, sqrt, ~0.3% fee, multi-hop |
| **Frontend** (`frontend/src/lib/__tests__`) | 27 | Client-side AMM math mirror, price impact, stroop conversion, display formatting |

Example — Rust contract output:

```
test result: ok. 16 passed; 0 failed   (test_pair.rs — invariants, LP, fees)
test result: ok. 12 passed; 0 failed   (shared — math library)
```

Example — frontend output:

```
PASS src/lib/__tests__/format.test.ts
PASS src/lib/__tests__/math.test.ts
Tests:       27 passed, 27 total
```

The frontend and SDK math are tested against the **same numeric vectors** as the Rust contract (e.g. `getAmountOut(100, 1000, 1000) === 90`), guaranteeing the off-chain quote always matches the on-chain result.

See [`docs/TESTING.md`](docs/TESTING.md) for the full invariant-based testing strategy.

---

## 🔄 CI/CD

Every push and PR to `main`/`develop` runs [`.github/workflows/test.yml`](.github/workflows/test.yml):

| Job | What it does |
|---|---|
| **Rust Contract Tests** | Build all contracts to WASM, `cargo test`, `clippy -D warnings`, `cargo fmt --check` |
| **Property Tests** | Proptest with 5,000 iterations on the shared math |
| **Code Coverage** | `cargo llvm-cov` → Codecov |
| **TypeScript SDK Tests** | `npm ci`, `npm test`, `tsc --noEmit` |
| **Frontend Tests & Build** | `npm ci`, `npm test`, `npm run typecheck`, `next build` |

Production deploys of the frontend are handled by **Vercel** (`frontend/vercel.json`).

---

## 🌐 Deployment & on-chain proof

All contracts are **live on Stellar Testnet**. Full address set: [`config/testnet.json`](config/testnet.json).

### Contract addresses

| Contract | Address |
|---|---|
| **Factory** | [`CBFUWAPNDVOUQVKWFEKLGX2ZW6V574QT5IR5K6BZX2357GODR3KTEE7W`](https://stellar.expert/explorer/testnet/contract/CBFUWAPNDVOUQVKWFEKLGX2ZW6V574QT5IR5K6BZX2357GODR3KTEE7W) |
| **Router** | [`CBV4H5OJSYOGEVP7EXXBZLJBPD7MG4PLKCEVLEIARCYZLG3ATYVABMSD`](https://stellar.expert/explorer/testnet/contract/CBV4H5OJSYOGEVP7EXXBZLJBPD7MG4PLKCEVLEIARCYZLG3ATYVABMSD) |
| **Pair: XLM/USDC** | [`CA54X7BPDD7NOQQBG77LOXDSPQ7WCKM7G7B4PPNWYPV6NQSPXTSLIJCE`](https://stellar.expert/explorer/testnet/contract/CA54X7BPDD7NOQQBG77LOXDSPQ7WCKM7G7B4PPNWYPV6NQSPXTSLIJCE) |
| **Pair: XLM/EURC** | [`CCXQUEJKX66A3VTOQR6B2GWR4ZEX325DSFNUCB7OJEA6SAVNWDTEZJFW`](https://stellar.expert/explorer/testnet/contract/CCXQUEJKX66A3VTOQR6B2GWR4ZEX325DSFNUCB7OJEA6SAVNWDTEZJFW) |
| Pair WASM hash | `8c3c21ff96006ef64f4c5a911b39c94a4a1d1947a3aa9638efc69e8ec8972958` |

### Token contracts (SAC)

| Token | Address |
|---|---|
| XLM | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| EURC | `CBLJGRO4T5WWIM3L623KDOI3Z75DFB62DBEF2B66GE4SYIWWAN7N3IH4` |

### Transaction hashes (contract interaction proof)

| Interaction | Transaction hash |
|---|---|
| **Swap** (`swap_exact_tokens_for_tokens` on Router) | [`826fbee155a110eb85ea93daa9927cdd5c51c621e0a89d092e6d082f1bbf7d7e`](https://stellar.expert/explorer/testnet/tx/826fbee155a110eb85ea93daa9927cdd5c51c621e0a89d092e6d082f1bbf7d7e) |
| **Add liquidity** (`add_liquidity` on Router) | [`9d76532faf2193c2b539056a15aa1f7484a67decf77891154368ce87f68bf846`](https://stellar.expert/explorer/testnet/tx/9d76532faf2193c2b539056a15aa1f7484a67decf77891154368ce87f68bf846) |

> Deployer account: [`GAVFAXLV54GY7M4WZYIZQGP5NFRAJOUQA2LA4UDDUWVJCOIEPEMKYNQG`](https://stellar.expert/explorer/testnet/account/GAVFAXLV54GY7M4WZYIZQGP5NFRAJOUQA2LA4UDDUWVJCOIEPEMKYNQG)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full deployment walkthrough.

---

## 📸 Screenshots

| Mobile responsive UI | CI/CD pipeline running | Test output |
|---|---|---|
| (<img width="250" alt="2026-06-12 00 42 37" src="https://github.com/user-attachments/assets/649ec175-ac47-4199-af7c-ada839dbeacb" />
) | ![CI pipeline](docs/screenshots/ci-pipeline.png) | ![Tests passing](docs/screenshots/tests-passing.png) |

> Images live in [`docs/screenshots/`](docs/screenshots/). See the [capture guide](docs/screenshots/README.md) to (re)generate them.

---

## 🧮 The AMM math

The core swap formula (0.3% LP fee baked into the `997/1000` factor):

```
amount_out = (amount_in × 997 × reserve_out)
             ─────────────────────────────────────
             (reserve_in × 1000 + amount_in × 997)
```

The invariant `x × y = k` is checked at the end of every swap — if it would decrease, the transaction reverts. All arithmetic uses checked `i128` operations; overflow panics the transaction. The exact same formula is implemented three times — in Rust (`contracts/shared/src/math.rs`), in the SDK (`sdk/typescript/src/math.ts`), and in the frontend (`frontend/src/lib/math.ts`) — and all three are tested against identical vectors.

---

## 🔐 Security

- **Immutable Pair contracts** — no admin functions, no upgrade path
- **Invariant enforcement** — `x*y=k` checked at the end of every swap
- **Checked arithmetic** — all math uses `checked_mul/add/sub`; overflows revert
- **Slippage protection** — every swap accepts `amount_out_min` / `amount_in_max`
- **Deadline validation** — stale transactions revert

> ⚠️ This is **testnet** software. Do not use on mainnet until a formal security audit is complete.

Full threat model and attack-surface analysis: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

*Built for the Stellar ecosystem.*
