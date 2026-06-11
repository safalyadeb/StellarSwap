# StellarSwap — Development Roadmap

**Version:** 1.0.0  
**Date:** 2026-06-02  
**Status:** Active  

---

## Overview

This roadmap defines the implementation phases for StellarSwap, from environment setup through testnet deployment. Each phase has defined goals, tasks, dependencies, deliverables, testing requirements, and a definition of done.

Estimated total duration: **12–14 weeks** for a solo senior engineer; **6–8 weeks** for a team of 3.

---

## Phase Summary

| Phase | Name | Duration | Status |
|-------|------|----------|--------|
| 0 | Environment Setup | 3 days | Planned |
| 1 | Shared Library & Core Math | 4 days | Planned |
| 2 | Reference Token Contract | 2 days | Planned |
| 3 | Factory Contract | 5 days | Planned |
| 4 | Pair Contract (Core AMM) | 10 days | Planned |
| 5 | LP Token Logic | 4 days | Planned |
| 6 | Router Contract | 6 days | Planned |
| 7 | Contract Integration Tests | 5 days | Planned |
| 8 | TypeScript SDK | 6 days | Planned |
| 9 | Frontend (Next.js) | 8 days | Planned |
| 10 | Indexer Service | 5 days | Planned |
| 11 | Deployment Infrastructure | 3 days | Planned |
| 12 | Testnet Deployment & QA | 4 days | Planned |
| 13 | Security Hardening | 4 days | Planned |
| 14 | Monitoring & Analytics | 3 days | Planned |

---

## Phase 0 — Environment Setup

### Goals
Establish a fully functional local development environment for Soroban contract development. Every team member should be able to run tests locally within 30 minutes of checkout.

### Tasks

#### 0.1 Rust Toolchain
- Install Rust stable + nightly toolchain
- Add `wasm32v1-none` target: `rustup target add wasm32v1-none`
- Install `cargo-soroban` (Stellar's Soroban CLI)
- Verify: `soroban --version`

#### 0.2 Stellar CLI (soroban-cli)
- Install via: `cargo install --locked stellar-cli --features opt`
- Configure testnet network:
  ```
  stellar network add testnet \
    --rpc-url https://soroban-testnet.stellar.org \
    --network-passphrase "Test SDF Network ; September 2015"
  ```
- Create test identity: `stellar keys generate alice --network testnet`
- Fund via Friendbot: `stellar keys fund alice --network testnet`

#### 0.3 Monorepo Structure
- Initialize workspace `Cargo.toml` with all contract members
- Initialize root `package.json` with Node.js workspaces
- Set up `.gitignore`, `.editorconfig`, `.rustfmt.toml`
- Initialize Git repository with conventional commits config

#### 0.4 Local Stellar Network (Docker)
- Docker Compose with Stellar Quickstart image
- Stellar RPC endpoint locally available at `http://localhost:8000`
- Horizon API available at `http://localhost:8000/horizon`
- PostgreSQL for indexer development

#### 0.5 CI Foundation
- GitHub Actions: `test.yml` workflow
  - `cargo test --workspace` on every push
  - `npm test` for SDK tests
  - Lint: `cargo clippy`, `cargo fmt --check`

### Dependencies
- None (starting phase)

### Architecture Decisions
- **Workspace Cargo.toml**: All contracts share a workspace, enabling unified dependency management and cross-contract imports of `shared/`.
- **Local Stellar network**: Use Stellar Quickstart Docker image rather than testnet for contract development — faster iteration, no network delays.

### Deliverables
- Working local environment
- `README.md` with setup instructions
- CI passing on empty workspace

### Testing Requirements
- `soroban contract invoke` produces expected output on a hello-world contract
- All team members can reproduce the environment from `README.md`

### Definition of Done
- [ ] `cargo build --workspace` succeeds
- [ ] Local Stellar node is running and accessible
- [ ] Test identity funded on testnet
- [ ] CI workflow runs successfully

---

## Phase 1 — Shared Library & Core Math Engine

### Goals
Build the foundational shared library containing all mathematical functions, error codes, and shared types used by all contracts. This phase is the mathematical foundation of the entire protocol.

### Tasks

#### 1.1 Error Definitions
```rust
// contracts/shared/src/errors.rs
pub enum StellarSwapError {
    // Factory
    PairAlreadyExists,
    IdenticalAddresses,
    ZeroAddress,
    // Pair
    InsufficientInputAmount,
    InsufficientOutputAmount,
    InsufficientLiquidity,
    InsufficientLiquidityMinted,
    InsufficientLiquidityBurned,
    InvalidTo,
    // Math
    Overflow,
    DivisionByZero,
    // Router
    ExpiredDeadline,
    InsufficientAAmount,
    InsufficientBAmount,
    ExcessiveInputAmount,
    InvalidPath,
}
```

#### 1.2 Core Math Functions
```rust
// contracts/shared/src/math.rs
pub fn get_amount_out(amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128
pub fn get_amount_in(amount_out: i128, reserve_in: i128, reserve_out: i128) -> i128
pub fn quote(amount_a: i128, reserve_a: i128, reserve_b: i128) -> i128
pub fn sqrt(y: i128) -> i128
```

#### 1.3 Shared Types
```rust
// contracts/shared/src/types.rs
pub struct PairInfo { pub token_x: Address, pub token_y: Address }
pub struct ReserveSnapshot { pub reserve_x: i128, pub reserve_y: i128 }
```

#### 1.4 Math Property Tests
Write property-based tests using `proptest` crate:
- `amount_out` is always less than `reserve_out`
- `amount_out` is always greater than zero for positive `amount_in`
- Invariant holds after swap: `(reserve_in + eff_in) * (reserve_out - out) >= reserve_in * reserve_out`
- `sqrt(n^2) == n` for all n in test range
- Fee is always exactly 0.3% (within integer precision)

#### 1.5 Overflow Boundary Tests
- Test with MAX_RESERVE inputs
- Confirm panic on overflow (not silent corruption)
- Document max safe input values

### Dependencies
- Phase 0 complete

### Architecture Decisions
- **`i128` for all reserves and amounts**: Maximum precision without needing big integer libraries. Soroban natively supports i128.
- **No floating point**: All math is integer arithmetic. Division is always last operation.
- **Shared crate imported by all contracts**: Avoids code duplication, single source of truth for math.
- **`checked_*` arithmetic**: Every multiplication and addition uses checked variants, panicking on overflow.

### Deliverables
- `contracts/shared/` crate with complete math, errors, and types
- 100% test coverage on math module
- Documentation with derivations

### Complexity Analysis
- `get_amount_out`: O(1) — 3 multiplications, 1 addition, 1 division
- `sqrt`: O(log n) — Newton's method iteration
- All operations bounded by i128 range given MAX_RESERVE constraint

### Security Considerations
- Panic on overflow is correct behavior — better to fail a transaction than corrupt state
- Division-by-zero checks prevent undefined behavior
- Test all boundary conditions explicitly

### Definition of Done
- [ ] All math functions implemented with `checked_*` arithmetic
- [ ] Property tests pass with `proptest`
- [ ] Boundary tests confirm no overflow at MAX_RESERVE
- [ ] `cargo test -p shared` passes
- [ ] Math derivations documented

---

## Phase 2 — Reference Token Contract

### Goals
Implement a minimal SEP-41-compliant token contract for use in tests. This is NOT production infrastructure — it's a testing primitive that allows us to create test tokens without Stellar's asset system.

### Tasks

#### 2.1 SEP-41 Token Interface
Implement all required SEP-41 functions:
- `mint(to: Address, amount: i128)`
- `burn(from: Address, amount: i128)`
- `transfer(from: Address, to: Address, amount: i128)`
- `transfer_from(spender: Address, from: Address, to: Address, amount: i128)`
- `approve(from: Address, spender: Address, amount: i128, expiration_ledger: u32)`
- `allowance(from: Address, spender: Address) → i128`
- `balance(id: Address) → i128`
- `decimals() → u32`
- `name() → String`
- `symbol() → String`

#### 2.2 Admin Functions
- `initialize(admin: Address, decimals: u32, name: String, symbol: String)`
- `set_admin(new_admin: Address)` — admin transfer

#### 2.3 Token Tests
- Mint tokens, verify balance
- Transfer tokens, verify sender/receiver balances
- Approve and transferFrom flow
- Burn tokens, verify total supply decreases
- Admin-only functions reject non-admin callers

### Dependencies
- Phase 1 (shared error types)

### Architecture Decisions
- **Separate contract, not part of Pair**: This mirrors real Stellar where tokens are independent contracts.
- **Mintable by admin only**: For test tokens, the test deployer is admin. In production, SAC tokens are used.

### Definition of Done
- [ ] All SEP-41 functions implemented
- [ ] Authorization checks on all mutating functions
- [ ] Unit tests cover all functions
- [ ] `cargo test -p token` passes

---

## Phase 3 — Factory Contract

### Goals
Implement the Factory contract that serves as the pool registry and creation hub. The Factory is the root of the protocol's contract graph.

### Tasks

#### 3.1 Storage Design
```rust
// DataKey enum for typed storage access
enum DataKey {
    Admin,
    FeeTo,
    FeeToSetter,
    PairCount,
    AllPairs(u32),             // index → address
    Pair(Address, Address),    // (token_x, token_y) → address
}
```

#### 3.2 Initialization
```rust
fn initialize(env: Env, admin: Address, fee_to_setter: Address)
```
- Store admin and fee_to_setter
- Initialize pair count to 0
- Extend instance TTL

#### 3.3 Pair Creation
```rust
fn create_pair(env: Env, token_a: Address, token_b: Address) -> Address
```
- Validate: `token_a != token_b`
- Validate: pair doesn't already exist
- Normalize order: `(token_0, token_1)` where `token_0 < token_1` (lexicographic)
- Deploy Pair contract with deterministic address (wasm hash + salt)
- Call `Pair.initialize(token_0, token_1, factory_address)`
- Store pair in both directions: `pairs[(token_0, token_1)] = pair_address`
- Append to `all_pairs` list
- Increment pair count
- Emit `pair_created` event

#### 3.4 View Functions
```rust
fn get_pair(env: Env, token_a: Address, token_b: Address) -> Address
fn all_pairs(env: Env, index: u32) -> Address
fn all_pairs_length(env: Env) -> u32
fn fee_to(env: Env) -> Option<Address>
fn fee_to_setter(env: Env) -> Address
```

#### 3.5 Admin Functions
```rust
fn set_fee_to(env: Env, fee_to: Address)        // only fee_to_setter
fn set_fee_to_setter(env: Env, new_setter: Address)  // only fee_to_setter
```

#### 3.6 Factory Tests
- Create pair — success
- Create pair — duplicate pair reverts
- Create pair — identical tokens reverts
- Get pair — returns correct address
- Get pair — reversed order returns same address
- Fee admin functions work and reject unauthorized callers
- `all_pairs` indexing is accurate

### Dependencies
- Phase 1 (shared types, errors)
- Phase 2 (token contract for testing)
- Pair contract WASM hash (for deploy) — can be mocked in tests using a simple WASM

### Architecture Decisions
- **Deterministic pair addresses**: Using a fixed salt derived from `(token_0, token_1)` enables off-chain pair address calculation without contract calls.
- **Token order normalization**: Always storing the lexicographically smaller address as `token_x` prevents duplicate pairs.
- **Stateless pair deployment**: Factory deploys Pair WASM with minimal initialization; all state lives in the Pair.

### Security Considerations
- Only the factory can call `Pair.initialize` (factory address stored in pair, future calls rejected)
- Fee admin functions have authorization checks
- No way to destroy or modify existing pairs

### Definition of Done
- [ ] Factory initializes correctly
- [ ] `create_pair` creates and registers pairs
- [ ] Duplicate and invalid pair creation reverts
- [ ] Token order normalization works bidirectionally
- [ ] `cargo test -p factory` passes with all test cases

---

## Phase 4 — Pair Contract (Core AMM)

### Goals
Implement the core AMM logic. This is the most complex and security-critical contract in the protocol.

### Tasks

#### 4.1 Storage Design
```rust
enum DataKey {
    TokenX,
    TokenY,
    ReserveX,
    ReserveY,
    TotalSupply,
    KLast,
    Factory,
    LpBalance(Address),
    Initialized,
}
```

#### 4.2 Initialization
```rust
fn initialize(env: Env, token_x: Address, token_y: Address, factory: Address)
```
- One-time call, gated by `Initialized` flag
- Store token addresses and factory reference
- Set reserves to 0, total supply to 0

#### 4.3 Add Liquidity
```rust
fn add_liquidity(
    env: Env,
    caller: Address,
    amount_x_desired: i128,
    amount_y_desired: i128,
    amount_x_min: i128,
    amount_y_min: i128,
    to: Address,
) -> (i128, i128, i128)  // (amount_x, amount_y, liquidity)
```

Logic:
1. `require_auth(&caller)`
2. Read reserves `(reserve_x, reserve_y)`
3. If first deposit: use full desired amounts
4. Else: calculate optimal amounts via `quote()` to maintain ratio
5. Validate: `amount_x >= amount_x_min && amount_y >= amount_y_min`
6. Transfer `amount_x` from caller to this contract
7. Transfer `amount_y` from caller to this contract
8. Calculate LP tokens to mint (see math model)
9. If first deposit: lock `MINIMUM_LIQUIDITY` to dead address
10. Mint LP tokens to `to`
11. Update reserves
12. Emit `liquidity_added` event

#### 4.4 Remove Liquidity
```rust
fn remove_liquidity(
    env: Env,
    caller: Address,
    liquidity: i128,
    amount_x_min: i128,
    amount_y_min: i128,
    to: Address,
) -> (i128, i128)  // (amount_x, amount_y)
```

Logic:
1. `require_auth(&caller)`
2. Validate `liquidity > 0`
3. Read `(reserve_x, reserve_y, total_supply)`
4. Calculate `amount_x = liquidity * reserve_x / total_supply`
5. Calculate `amount_y = liquidity * reserve_y / total_supply`
6. Validate minimums
7. Burn LP tokens from caller
8. Transfer `amount_x` to `to`
9. Transfer `amount_y` to `to`
10. Update reserves
11. Emit `liquidity_removed` event

#### 4.5 Swap
```rust
fn swap(
    env: Env,
    caller: Address,
    amount_x_out: i128,
    amount_y_out: i128,
    to: Address,
) -> (i128, i128)
```

Note: One of `amount_x_out` or `amount_y_out` must be zero. The Router calls this after computing amounts.

Logic:
1. Validate: exactly one output is non-zero
2. Validate: output < reserve (can't drain pool)
3. Read balances after transfer-in (Router transfers input before calling swap)
4. Calculate `amount_x_in` and `amount_y_in` from balance deltas
5. Validate: at least one input is positive
6. Validate: invariant holds — `(balance_x - amount_x_out * 3/1000) * (balance_y - amount_y_out * 3/1000) >= reserve_x * reserve_y`
7. Update reserves to new balances
8. Transfer output tokens to `to`
9. Emit `swap` event

**Note on Soroban swap flow**: Unlike Ethereum (where tokens are sent before swap call), in Soroban we use a "transfer-in within the same call" pattern for security. The Router transfers tokens in and calls swap atomically.

#### 4.6 Sync
```rust
fn sync(env: Env)
```
- Read actual token balances from token contracts
- Update reserves to match actual balances
- Emit `sync` event
- Useful if tokens are sent directly to the pair

#### 4.7 Skim
```rust
fn skim(env: Env, to: Address)
```
- Transfer excess tokens (actual balance > stored reserve) to `to`
- Useful to recover accidentally sent tokens

#### 4.8 View Functions
```rust
fn get_reserves(env: Env) -> (i128, i128)
fn token_x(env: Env) -> Address
fn token_y(env: Env) -> Address
fn total_supply(env: Env) -> i128
fn balance_of(env: Env, account: Address) -> i128
```

#### 4.9 Pair Unit Tests
- First liquidity deposit: correct LP minting, MINIMUM_LIQUIDITY burned
- Second deposit: proportional LP minting
- Swap: correct amount_out, fee retained
- Swap: reverts if amount_out exceeds reserve
- Remove liquidity: proportional token return
- Invariant holds after 1000 random swaps (property test)
- Sync: updates reserves to match actual balances
- Skim: recovers excess tokens

### Dependencies
- Phase 1 (math, errors)
- Phase 2 (token contract for testing)
- Phase 3 (factory — pair is registered through factory in integration tests)

### Architecture Decisions
- **Transfer-in pattern**: Input tokens are transferred in the same call, before swap computation. This is safe in Soroban's synchronous model.
- **Raw swap function**: The Pair's `swap` is low-level. The Router provides the user-friendly interface. This keeps Pair logic minimal and auditable.
- **Invariant check at end**: After computing new balances, verify invariant. This catches any logic error.

### Security Considerations
- Invariant check is the last line of defense — all bugs in amount calculation are caught here
- Minimum liquidity prevents pool from being drained to zero
- Authorization on all state-changing functions
- Reserves updated atomically with transfers

### Definition of Done
- [ ] All liquidity functions work correctly
- [ ] Swap enforces invariant
- [ ] Property tests confirm invariant holds for 1000 random swaps
- [ ] Edge cases (empty pool, single-sided amounts) handled correctly
- [ ] `cargo test -p pair` passes

---

## Phase 5 — LP Token Logic

### Goals
Implement LP token minting, burning, and transfer as part of the Pair contract (SEP-41 compatible interface).

### Tasks

#### 5.1 LP Token State
LP token state lives in the Pair contract:
- `total_supply: i128` — total LP tokens in circulation
- `balances: Map<Address, i128>` — LP token balances per holder

#### 5.2 SEP-41 Interface on Pair
```rust
fn lp_transfer(env: Env, from: Address, to: Address, amount: i128)
fn lp_approve(env: Env, from: Address, spender: Address, amount: i128, exp_ledger: u32)
fn lp_allowance(env: Env, from: Address, spender: Address) -> i128
fn lp_balance(env: Env, id: Address) -> i128
fn lp_total_supply(env: Env) -> i128
fn lp_decimals(env: Env) -> u32
fn lp_name(env: Env) -> String
fn lp_symbol(env: Env) -> String
```

#### 5.3 Internal Mint/Burn
```rust
// Internal only — not exposed via public interface
fn mint(env: &Env, to: &Address, amount: i128)
fn burn(env: &Env, from: &Address, amount: i128)
```

#### 5.4 LP Token Tests
- Mint increases balance and total supply
- Burn decreases balance and total supply
- Transfer moves balance between accounts
- Approve/transferFrom flow
- Cannot burn more than balance (reverts)
- Cannot transfer more than balance (reverts)

### Dependencies
- Phase 4 (Pair contract base)

### Architecture Decisions
- **LP token embedded in Pair**: Unlike Uniswap V2 which creates a separate ERC-20 contract per pair, we embed LP token logic in the Pair. This saves a contract deployment and simplifies the interaction model.
- **SEP-41 compatible**: LP tokens can be used by any SEP-41-aware protocol.

### Definition of Done
- [ ] LP token mint/burn integrated with add/remove liquidity
- [ ] SEP-41 interface functions implemented
- [ ] Transfer and approval flows work
- [ ] All LP token tests pass

---

## Phase 6 — Router Contract

### Goals
Implement the stateless Router that provides a safe, user-friendly interface for swaps and liquidity operations.

### Tasks

#### 6.1 Core Swap Functions
```rust
fn swap_exact_tokens_for_tokens(
    env: Env,
    caller: Address,
    amount_in: i128,
    amount_out_min: i128,
    path: Vec<Address>,  // [token_in, ..., token_out]
    to: Address,
    deadline: u64,
) -> Vec<i128>

fn swap_tokens_for_exact_tokens(
    env: Env,
    caller: Address,
    amount_out: i128,
    amount_in_max: i128,
    path: Vec<Address>,
    to: Address,
    deadline: u64,
) -> Vec<i128>
```

#### 6.2 Liquidity Functions
```rust
fn add_liquidity(
    env: Env,
    caller: Address,
    token_a: Address,
    token_b: Address,
    amount_a_desired: i128,
    amount_b_desired: i128,
    amount_a_min: i128,
    amount_b_min: i128,
    to: Address,
    deadline: u64,
) -> (i128, i128, i128)

fn remove_liquidity(
    env: Env,
    caller: Address,
    token_a: Address,
    token_b: Address,
    liquidity: i128,
    amount_a_min: i128,
    amount_b_min: i128,
    to: Address,
    deadline: u64,
) -> (i128, i128)
```

#### 6.3 View / Quote Functions
```rust
fn get_amount_out(env: Env, amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128
fn get_amount_in(env: Env, amount_out: i128, reserve_in: i128, reserve_out: i128) -> i128
fn get_amounts_out(env: Env, amount_in: i128, path: Vec<Address>) -> Vec<i128>
fn get_amounts_in(env: Env, amount_out: i128, path: Vec<Address>) -> Vec<i128>
fn quote(env: Env, amount_a: i128, reserve_a: i128, reserve_b: i128) -> i128
```

#### 6.4 Deadline Middleware
```rust
fn ensure_deadline(env: &Env, deadline: u64) {
    let current = env.ledger().timestamp();
    if current > deadline {
        panic_with_error!(env, StellarSwapError::ExpiredDeadline);
    }
}
```

#### 6.5 Multi-Hop Swap Logic
For a path `[A, B, C]`:
1. Get amounts: `[amount_in_A, amount_out_B, amount_out_C]`
2. Transfer `amount_in_A` from caller to pair(A,B)
3. Call `pair(A,B).swap(0, amount_out_B, pair(B,C))`
4. Call `pair(B,C).swap(0, amount_out_C, to)`

Tokens flow through pairs directly — never held by Router.

#### 6.6 Router Tests
- Single-hop swap: correct amounts, slippage check
- Multi-hop swap: tokens flow correctly through 2 pairs
- Add liquidity: correct LP minting, amount optimization
- Remove liquidity: correct token redemption
- Deadline: revert on expired deadline
- Slippage: revert when amount_out < amount_out_min
- Invalid path (length < 2): reverts
- Path with non-existent pair: reverts

### Dependencies
- Phase 3 (Factory — pair lookup)
- Phase 4 + 5 (Pair + LP token)

### Architecture Decisions
- **Stateless Router**: All state is in Factory and Pair. Router can be upgraded without migration.
- **Router does NOT hold tokens**: In the multi-hop flow, tokens transfer pair-to-pair directly. The router orchestrates but never custodies.
- **Separate deadline check**: Applied uniformly to all state-changing functions.

### Security Considerations
- Deadline prevents stale transaction execution
- Slippage minimum prevents sandwich attacks from being profitable
- Router never holds tokens (no custody risk)

### Definition of Done
- [ ] All swap functions work for single and multi-hop paths
- [ ] Liquidity functions work end-to-end
- [ ] All quote functions return accurate values
- [ ] All deadline and slippage checks work
- [ ] `cargo test -p router` passes

---

## Phase 7 — Integration Test Suite

### Goals
Build comprehensive integration tests that test the entire contract stack together, simulating real user scenarios.

### Tasks

#### 7.1 Test Environment Setup
- Soroban test environment with multiple users (alice, bob, lp_provider)
- Deploy all contracts (token_x, token_y, factory, router)
- Helper functions for common operations

#### 7.2 Liquidity Provider Scenarios
- LP creates pool, adds initial liquidity
- Second LP adds liquidity (proportional amounts)
- LP removes partial liquidity
- LP removes all liquidity
- LP earns fees after swaps

#### 7.3 Trader Scenarios
- Swap token_x for token_y (single hop)
- Swap token_y for token_x
- Swap via 2-hop path (x → y → z)
- Swap with tight slippage (should succeed)
- Swap with exceeded slippage (should revert)
- Expired deadline (should revert)
- Swap draining 50% of pool (price impact check)

#### 7.4 Economic Invariants
- After N random swaps: LP tokens redeem more than deposited (fee accumulation)
- Invariant k is non-decreasing across all operations
- Reserves match actual token balances after every operation

#### 7.5 Attack Scenarios
- Attempt double-spend (should fail)
- Attempt swap with zero input (should revert)
- Attempt creating duplicate pair (should revert)
- Attempt removing more liquidity than balance (should revert)

### Definition of Done
- [ ] All integration test scenarios pass
- [ ] Economic invariant tests confirm fee accumulation
- [ ] Attack scenarios all revert as expected
- [ ] Test coverage report > 90% for all contracts

---

## Phase 8 — TypeScript SDK

### Goals
Build a TypeScript SDK that abstracts contract interactions for frontend and external developer use.

### Tasks

#### 8.1 SDK Structure
```
sdk/typescript/src/
├── index.ts              # Exports
├── factory.ts            # FactoryClient class
├── pair.ts               # PairClient class
├── router.ts             # RouterClient class
├── math.ts               # Client-side math (mirrors contract math)
├── types.ts              # TypeScript interfaces
└── utils/
    ├── stellar.ts        # Stellar SDK helpers
    └── token.ts          # Token utilities
```

#### 8.2 Contract Clients
Each client wraps a contract's functions:
```typescript
class RouterClient {
  constructor(contractId: string, networkConfig: NetworkConfig)
  
  async swapExactTokensForTokens(params: SwapParams): Promise<SwapResult>
  async addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult>
  async removeLiquidity(params: RemoveLiquidityParams): Promise<RemoveLiquidityResult>
  async getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): Promise<bigint>
  async getAmountsOut(amountIn: bigint, path: string[]): Promise<bigint[]>
}
```

#### 8.3 Math Utilities
Port contract math to TypeScript using `BigInt`:
```typescript
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint
export function getAmountsOut(amountIn: bigint, path: PathReserves[]): bigint[]
export function quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint
export function calcPriceImpact(amountIn: bigint, reserveIn: bigint): number
```

#### 8.4 Transaction Builder
```typescript
class TransactionBuilder {
  buildSwapTx(params: SwapParams): Transaction
  buildAddLiquidityTx(params: AddLiquidityParams): Transaction
  buildRemoveLiquidityTx(params: RemoveLiquidityParams): Transaction
}
```

#### 8.5 SDK Tests
- Math functions match Rust contract math (cross-verify with known inputs)
- Transaction builders produce valid Soroban transactions
- Contract clients parse responses correctly

### Definition of Done
- [ ] All contract functions wrapped in SDK clients
- [ ] Math utilities are bit-for-bit identical to contract math
- [ ] TypeScript types exported for all params/results
- [ ] SDK tests pass
- [ ] `npm run build` succeeds

---

## Phase 9 — Frontend (Next.js)

### Goals
Build a functional, clean DeFi frontend for swap and liquidity operations.

### Tasks

#### 9.1 Pages
- `/` — Swap page
- `/liquidity` — Add/remove liquidity
- `/pools` — Pool explorer table

#### 9.2 Swap UI
- Token selector dropdowns
- Amount input with live quote
- Price impact display
- Slippage tolerance settings (0.1%, 0.5%, 1.0%, custom)
- Swap button + transaction confirmation modal
- Transaction history

#### 9.3 Liquidity UI
- Token pair selector
- Amount inputs with ratio lock
- LP token preview
- Add liquidity confirmation
- Manage positions (view LP balance, remove)

#### 9.4 Wallet Integration
- Freighter wallet connect/disconnect
- Account address display
- Network indicator (testnet)

#### 9.5 Pool Explorer
- Table of all pools: pair, TVL, 24h volume, 24h fees
- Clickable rows → pool detail page

### Definition of Done
- [ ] Swap UI executes real testnet swaps
- [ ] Liquidity UI adds/removes real liquidity
- [ ] Freighter wallet integration works
- [ ] All pages render without errors
- [ ] Mobile responsive (basic)

---

## Phase 10 — Indexer Service

### Goals
Build an event indexer that reads Soroban events from Horizon and provides analytics APIs.

### Tasks

#### 10.1 Horizon Event Subscription
- Subscribe to `soroban_events` for all registered pair addresses
- Process: `swap`, `liquidity_added`, `liquidity_removed`, `pair_created`
- Handle backfill from genesis of factory deployment

#### 10.2 Database Schema
```sql
CREATE TABLE pairs (id TEXT, token_x TEXT, token_y TEXT, created_at BIGINT);
CREATE TABLE swaps (id TEXT, pair_id TEXT, amount_in TEXT, amount_out TEXT, token_in TEXT, ledger BIGINT, ts BIGINT);
CREATE TABLE liquidity_events (id TEXT, pair_id TEXT, type TEXT, provider TEXT, amount_x TEXT, amount_y TEXT, lp TEXT, ledger BIGINT);
CREATE TABLE pair_snapshots (pair_id TEXT, reserve_x TEXT, reserve_y TEXT, ledger BIGINT);
```

#### 10.3 REST API
```
GET /pairs                    → list all pairs
GET /pairs/:id                → pair detail + reserves
GET /pairs/:id/swaps          → swap history
GET /swaps?from=&to=          → filtered swap history
GET /analytics/tvl            → total TVL
GET /analytics/volume/24h     → 24h volume
```

### Definition of Done
- [ ] Indexer syncs all events from testnet deployment
- [ ] REST API returns correct data
- [ ] Frontend pool explorer powered by indexer API

---

## Phase 11 — Deployment Infrastructure

### Goals
Build robust, repeatable deployment scripts for testnet.

### Tasks

#### 11.1 Deploy Scripts
```bash
scripts/deploy/
├── 01_deploy_token.sh      # Deploy test tokens
├── 02_deploy_factory.sh    # Deploy factory, initialize
├── 03_deploy_router.sh     # Deploy router with factory address
├── 04_create_pools.sh      # Create test pools
├── 05_seed_liquidity.sh    # Add initial liquidity
└── deploy_all.sh           # Full deployment
```

#### 11.2 Config Management
- Output contract addresses to `config/testnet.json`
- SDK and frontend read from config file
- Environment variable overrides

#### 11.3 Verification
```typescript
// scripts/verify/verify_contracts.ts
// After deploy: verify factory has correct fee_to_setter
// Verify router points to correct factory
// Verify test pools have correct reserves
```

### Definition of Done
- [ ] `deploy_all.sh` deploys all contracts to testnet in correct order
- [ ] `config/testnet.json` is populated with correct addresses
- [ ] Verification script confirms all contracts initialized correctly

---

## Phase 12 — Testnet Deployment & QA

### Goals
Deploy full system to Stellar testnet and perform end-to-end QA.

### Tasks
- Deploy all contracts using Phase 11 scripts
- Seed liquidity for at least 3 token pairs
- Run full end-to-end swap on testnet via frontend
- Run add/remove liquidity on testnet via frontend
- Verify indexer syncs testnet events
- Record all contract addresses in `config/testnet.json`
- Manual QA checklist (all core user flows)

### Definition of Done
- [ ] Contracts live on testnet
- [ ] End-to-end swap works via frontend
- [ ] Add/remove liquidity works via frontend
- [ ] Indexer indexes testnet events
- [ ] All contract addresses documented

---

## Phase 13 — Security Hardening

### Goals
Review all contracts for security issues before considering mainnet readiness.

### Tasks
- Internal security review against SECURITY.md checklist
- Fuzz test core math functions
- Economic simulation: LP profit/loss across 10,000 simulated swaps
- Boundary condition review: MAX_RESERVE, zero amounts, dust amounts
- Verify all `require_auth` calls are on correct actors
- Verify all events emit correct data
- Prepare audit prep documentation

### Definition of Done
- [ ] No critical or high security findings
- [ ] Fuzz tests find no panics or incorrect results
- [ ] Economic simulation confirms LP profitability
- [ ] Audit prep documentation complete

---

## Phase 14 — Monitoring & Analytics

### Goals
Set up production monitoring for the testnet deployment.

### Tasks
- Prometheus metrics for indexer (events per minute, sync lag)
- Grafana dashboard: TVL, volume, swap count, top pairs
- Alerting: indexer lag > 5 minutes
- Frontend analytics: pool APY estimates

### Definition of Done
- [ ] Grafana dashboard shows real testnet data
- [ ] Alerting configured
- [ ] APY estimates shown on frontend pool page

---

*End of ROADMAP — Version 1.0.0*
