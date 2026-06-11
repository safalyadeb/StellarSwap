# StellarSwap

> A production-grade, Uniswap V2-inspired AMM DEX built on Stellar using Soroban smart contracts.

[![Tests](https://github.com/stellarswap/stellarswap/actions/workflows/test.yml/badge.svg)](https://github.com/stellarswap/stellarswap/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What is StellarSwap?

StellarSwap is a decentralized exchange (DEX) protocol for the Stellar blockchain. It implements a constant product Automated Market Maker (AMM) — the same model that powers Uniswap V2 — redesigned from first principles for Stellar's execution environment and account model.

**Key features:**
- Permissionless liquidity pools for any token pair
- LP tokens with embedded fee accumulation
- 0.3% swap fee distributed to liquidity providers
- Multi-hop routing (A→B→C via intermediate pools)
- Slippage protection and deadline validation
- TypeScript SDK for frontend and developer integration
- Testnet-deployable with provided scripts

---

## Architecture

```
Factory Contract        ← Pool registry, deploys Pair contracts
    │
    └──► Pair Contract  ← AMM core (one per token pair)
              │         - Constant product invariant
              │         - LP token accounting
              └──► Token Contracts (SEP-41 / SAC)

Router Contract         ← User-facing (stateless)
    │                   - Multi-hop routing
    └──► Factory        - Amount computation
    └──► Pair(s)        - Deadline & slippage checks
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full diagrams and data flow.

---

## Quick Start

### Prerequisites

```bash
# Rust + WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli --features opt

# Node.js 20+
nvm install 20

# Docker (for local development)
```

### Local Development

```bash
# Clone and enter the project
git clone https://github.com/stellarswap/stellarswap
cd stellarswap

# Start local Stellar node + PostgreSQL
docker-compose -f infra/docker/docker-compose.yml up -d

# Build contracts
cargo build --workspace --target wasm32-unknown-unknown --release

# Run tests
cargo test --workspace

# Deploy locally
NETWORK=local ./scripts/deploy/deploy_all.sh
```

### Testnet Deployment

```bash
# Create and fund deployer identity
stellar keys generate deployer
stellar keys fund deployer --network testnet

# Deploy
NETWORK=testnet DEPLOYER_KEY=deployer ADMIN_KEY=admin \
  ./scripts/deploy/deploy_all.sh
```

---

## Math

The core AMM formula:

```
amount_out = (amount_in × 997 × reserve_out)
             ─────────────────────────────────
             (reserve_in × 1000 + amount_in × 997)
```

The `997/1000` factor represents the 0.3% LP fee. The invariant `x × y = k` is enforced at the end of every swap — if it fails, the transaction reverts.

---

## Repository Structure

```
stellarswap/
├── contracts/          # Soroban smart contracts (Rust)
│   ├── shared/         # Math, errors, shared types
│   ├── factory/        # Pool registry + deployer
│   ├── pair/           # AMM core + LP tokens
│   ├── router/         # User-facing swap interface
│   └── token/          # Reference SEP-41 token (testing)
├── sdk/typescript/     # TypeScript SDK
├── frontend/           # Next.js swap UI
├── indexer/            # Horizon event indexer
├── scripts/            # Deployment scripts
├── infra/              # Docker and PostgreSQL
├── config/             # Per-network contract addresses
└── docs/               # Architecture, security, deployment, roadmap
```

---

## Contract Addresses

### Testnet

| Contract | Address |
|----------|---------|
| Factory | *(deploy to populate)* |
| Router | *(deploy to populate)* |

Addresses are written to `config/testnet.json` after deployment.

---

## Security

StellarSwap has been designed with security as the primary concern:

- **Immutable Pair contracts**: No admin functions, no upgrade path
- **Invariant enforcement**: `x*y=k` checked at end of every swap
- **Checked arithmetic**: All operations use `checked_mul/add/sub` — overflows revert
- **Slippage protection**: All swaps accept `amount_out_min`
- **Deadline validation**: Stale transactions automatically revert

See [docs/SECURITY.md](docs/SECURITY.md) for the full threat model and attack surface analysis.

> ⚠️ This is testnet software. Do not use on mainnet until a formal security audit is complete.

---

## Development Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 0 | ✅ | Environment setup |
| 1 | ✅ | Shared math library |
| 2 | ✅ | Reference token contract |
| 3 | ✅ | Factory contract |
| 4 | ✅ | Pair contract (AMM core) |
| 5 | ✅ | LP token logic |
| 6 | ✅ | Router contract |
| 7 | 🔄 | Integration tests |
| 8 | 🔄 | TypeScript SDK |
| 9 | 📋 | Frontend (Next.js) |
| 10 | 📋 | Indexer service |
| 11 | ✅ | Deployment scripts |
| 12 | 📋 | Testnet deployment |
| 13 | 📋 | Security hardening |
| 14 | 📋 | Monitoring |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). We welcome pull requests for:
- Bug fixes
- Test improvements
- Documentation improvements
- Gas optimizations (with benchmark proof)

---

## License

MIT — see [LICENSE](LICENSE).

---

*Built with ❤️ for the Stellar ecosystem.*
