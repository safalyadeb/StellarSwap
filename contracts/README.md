# StellarSwap Smart Contracts

Uniswap v2-style automated market maker (AMM) built on Stellar Soroban.

## What the contracts do

| Contract | Description |
|----------|-------------|
| **factory** | Pool registry. Permissionlessly deploys and tracks Pair contracts. |
| **pair** | AMM pool. Holds reserves of two tokens, mints/burns LP tokens, executes swaps with a 0.3 % fee. |
| **router** | Stateless user-facing gateway. Computes optimal amounts, routes multi-hop swaps, and calls Pair on behalf of users. |
| **token** | SAC-compatible fungible token used for testnet assets (USDC, EURC). |
| **shared** | Common types, math (constant-product formula), error codes, and cross-contract interfaces. |

## Folder structure

```
contracts/
├── factory/src/     contract.rs, storage.rs, events.rs, lib.rs
├── pair/src/        contract.rs, storage.rs, events.rs, lp_token.rs, lib.rs
├── router/src/      contract.rs, storage.rs, helpers.rs, lib.rs
├── token/src/       contract.rs, storage.rs, lib.rs
├── shared/src/      lib.rs, math.rs, types.rs, errors.rs, interfaces.rs
└── integration/     end-to-end tests (tests/*.rs)
```

The workspace `Cargo.toml` and `Cargo.lock` live in the repo root.

## Prerequisites

```bash
rustup target add wasm32v1-none
cargo install --locked stellar-cli --features opt
```

## Build

```bash
make build
# or directly:
cargo build --workspace --target wasm32v1-none --release
```

WASM artifacts land in `target/wasm32v1-none/release/stellar_swap_*.wasm`.

## Test

```bash
make test
# or:
cargo test --workspace
```

Integration tests live in `contracts/integration/tests/` and cover factory creation, pair swaps, and LP operations.

## Format / Lint

```bash
make fmt    # cargo fmt --all
make lint   # cargo clippy --workspace -- -D warnings
```

## Deploy

Requires:
- `STELLAR_SECRET_KEY` — deployer secret key (S…)
- Stellar CLI installed

```bash
make deploy
# or manually:
stellar contract deploy \
  --wasm target/wasm32v1-none/release/stellar_swap_router.wasm \
  --source $STELLAR_SECRET_KEY \
  --network testnet
```

Repeat for `factory`, `pair`, and `token`. After deployment, initialize the factory with the pair WASM hash and admin address, then initialize the router with the factory address.

## Environment variables

| Variable | Description |
|----------|-------------|
| `STELLAR_SECRET_KEY` | Deployer/admin secret key |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (default: `https://soroban-testnet.stellar.org`) |
