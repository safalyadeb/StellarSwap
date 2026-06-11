# StellarSwap — Product Requirements Document (PRD)

**Version:** 1.0.0  
**Date:** 2026-06-02  
**Status:** Approved  
**Authors:** Protocol Engineering Team  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Product Vision](#2-product-vision)
3. [Problem Statement](#3-problem-statement)
4. [Core Features](#4-core-features)
5. [Technical Architecture](#5-technical-architecture)
6. [Mathematical Model](#6-mathematical-model)
7. [Security Design](#7-security-design)
8. [Repository & Monorepo Structure](#8-repository--monorepo-structure)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Non-Goals (MVP Scope)](#10-non-goals-mvp-scope)

---

## 1. Project Overview

### What is StellarSwap?

StellarSwap is a decentralized exchange (DEX) protocol built on the Stellar blockchain using Soroban smart contracts. It implements an Automated Market Maker (AMM) model inspired by Uniswap V2, redesigned from first principles for Stellar's execution environment, account model, and asset system.

The protocol allows:
- Anyone to **create liquidity pools** for any two Stellar-compatible tokens
- **Liquidity providers (LPs)** to deposit token pairs and earn swap fees
- **Traders** to swap between any tokens with on-chain price discovery
- **Developers** to build on top of a composable, auditable DeFi primitive

### Why Stellar + Soroban?

**Stellar** is a Layer-1 blockchain designed for fast, cheap financial transactions with sub-5-second finality and fees measured in fractions of a cent. Its native asset issuance model (Stellar Classic) and the programmability layer (Soroban) make it an ideal candidate for DeFi infrastructure.

**Soroban** is Stellar's smart contract platform, written in Rust, launched on mainnet in 2024. It uses a WASM execution environment and provides:
- Deterministic execution with metered resource limits
- Native support for Stellar's asset model (SEP-41 interface)
- Efficient storage with ledger-based state management
- Low gas costs relative to EVM chains
- Formal verifiability through Rust's type system

**Why now?** Soroban is production-ready but the DeFi ecosystem is nascent. StellarSwap is positioned to be foundational liquidity infrastructure for the Stellar DeFi ecosystem.

### How AMMs Work

Traditional exchanges use order books: buyers and sellers post offers, and a matching engine pairs them. AMMs replace order books with a mathematical formula governing token prices based on pool reserves.

In a constant product AMM:
- A pool holds reserves of two tokens: `reserve_x` and `reserve_y`
- The **invariant** `x * y = k` must hold after every swap
- Price is determined by the ratio of reserves: `price_x = reserve_y / reserve_x`
- As traders buy token X, reserve_x decreases and reserve_y increases, raising the price of X
- No counterparty needed — the pool itself is always willing to trade at the current curve price

This creates:
- **Continuous liquidity** at all price points
- **Passive income** for LPs who earn a percentage of every swap
- **On-chain price discovery** that is transparent and permissionless

### Why Uniswap V2 Architecture?

Uniswap V2 (launched 2020) is the most battle-tested AMM design in DeFi history. It is:
- **Simple and auditable**: the core invariant is a single line of math
- **Composable**: the factory/pair/router pattern enables permissionless pool creation
- **Proven secure**: billions of dollars of liquidity secured over years
- **Well understood**: LP economics, price impact, and fee mechanics are deeply documented

Uniswap V2 is chosen over V3 because:
- V3 concentrated liquidity requires significantly more implementation complexity
- V2's simplicity makes it a better foundation for a nascent ecosystem
- V2 mechanics are easier to audit, teach, and build on
- V3 can be built on top of V2 infrastructure in a future phase

### How Stellar Differs From Ethereum

| Dimension | Ethereum | Stellar/Soroban |
|-----------|----------|-----------------|
| Account model | EOAs + contract accounts | Stellar accounts (public key pairs) |
| Native assets | ETH + ERC-20 contracts | Stellar native + issued assets + Soroban tokens |
| Token standard | ERC-20 (arbitrary contract) | SEP-41 (standardized Soroban interface) |
| Storage | Per-contract storage trees | Ledger entries with TTL-based expiration |
| Execution | EVM (stack-based bytecode) | WASM (via Soroban host) |
| Finality | ~12s (PoS) | ~5s (SCP consensus) |
| Fees | Gas market (variable) | Resource-metered, predictable |
| Reentrancy | Possible, must guard | WASM call model — single-frame per invoke |
| Upgradability | Proxy pattern | Built-in contract upgrade mechanism |
| Token approvals | ERC-20 `approve/transferFrom` | Direct transfer authorization model |

**Critical architectural differences affecting our design:**

1. **Storage TTL**: Soroban storage entries expire unless extended. Our contracts must proactively extend TTLs for critical state.
2. **No ERC-20 `approve` attack surface**: Soroban's asset model uses a different authorization flow, eliminating a class of Ethereum exploits.
3. **Ledger-based state**: Storage is typed (Instance, Persistent, Temporary) and must be designed accordingly.
4. **Account abstraction**: Stellar accounts are natively multi-sig capable; wallets are public key pairs, not separate contract types.
5. **Event model**: Soroban events are ledger-indexed and queryable via Horizon API, not logs requiring full-node access.

### MVP Scope

**In Scope:**
- Factory contract (pool creation, registry)
- Pair contract (AMM core, liquidity management, swaps)
- Router contract (user-facing swap routing, multi-hop)
- LP token minting/burning
- 0.3% swap fee with LP fee distribution
- Testnet deployment scripts
- TypeScript client SDK
- Basic Next.js frontend (swap + liquidity)
- Integration test suite

**Out of Scope (MVP):**
- Concentrated liquidity (V3-style)
- Protocol fee governance
- Yield farming / staking
- Limit orders
- Mainnet deployment
- Advanced analytics dashboard
- Mobile app
- Cross-chain bridges

### Future Roadmap (Post-MVP)

| Phase | Feature |
|-------|---------|
| V1.1 | Protocol fee governance (DAO) |
| V1.2 | Yield farming / liquidity mining |
| V1.3 | Concentrated liquidity ranges |
| V2.0 | Cross-chain swap bridge integration |
| V2.1 | Options / derivatives layer |

---

## 2. Product Vision

### Target Users

#### Liquidity Providers (LPs)
Individuals or institutions who deposit token pairs into pools to earn passive income from swap fees. LPs:
- Deposit equal value of two tokens
- Receive LP tokens representing their pool share
- Earn 0.3% of every swap proportional to their share
- Can withdraw at any time by burning LP tokens

**Why they'd choose StellarSwap**: Low fees to add/remove liquidity (Stellar's near-zero fees), transparent on-chain fee accrual, simple UI.

#### Traders / Swappers
Users who want to exchange one token for another without a centralized exchange. They:
- Submit a swap transaction specifying input token, output token, amount, and slippage tolerance
- Receive the output token atomically in the same transaction
- Pay a 0.3% fee embedded in the swap math

**Why they'd choose StellarSwap**: No KYC, no custody risk, near-instant finality, predictable pricing.

#### Protocol Developers / Integrators
Teams building wallets, aggregators, bots, or other DeFi products that need liquidity primitives. They:
- Integrate via the TypeScript SDK
- Call Router contract functions programmatically
- Use event streams for price feeds and analytics

**Why they'd choose StellarSwap**: Clean SDK, well-documented contracts, composable architecture.

#### Arbitrageurs
Algorithmic traders who profit by correcting price imbalances between StellarSwap pools and other markets. They provide a critical economic function: keeping pool prices aligned with global market prices.

### Ecosystem Opportunity

Stellar's DeFi TVL in 2025 is a small fraction of Ethereum's. This is an opportunity: a well-built AMM can capture significant market share in a less saturated ecosystem. Stellar's integration with traditional finance (MoneyGram, Circle USDC) creates natural demand for DeFi rails between on-ramps and DeFi yield.

---

## 3. Problem Statement

### Current Limitations in Stellar DeFi

1. **Stellar DEX (SDEX)**: Stellar's built-in order book DEX supports trading but requires active market makers and doesn't provide passive AMM liquidity. Thin order books mean high slippage for large trades.

2. **Limited composability**: Without a standardized AMM primitive, DeFi applications on Stellar cannot compose liquidity across protocols.

3. **No LP incentive structure**: SDEX doesn't provide fee-earning LP tokens that can be used as collateral or yield-bearing positions.

4. **Centralized alternatives**: Most Stellar token trading happens on centralized exchanges (Binance, Coinbase), introducing custody risk and geographic restrictions.

5. **Bootstrap problem**: Without passive liquidity infrastructure, new Stellar token projects cannot establish on-chain markets without attracting active market makers.

### Why Liquidity Infrastructure Matters

Liquidity is the foundation of DeFi. Without deep, reliable liquidity:
- New tokens cannot establish fair market prices
- Large trades incur unacceptable slippage
- Arbitrage cannot keep prices efficient
- Other DeFi protocols (lending, derivatives) cannot safely price assets

A well-designed AMM solves all these problems permissionlessly.

### Problems with Centralized Exchanges

- Counterparty risk (exchange insolvency, hacks)
- KYC/AML requirements excluding global users
- Geographic restrictions
- Opaque fee structures
- No composability with on-chain protocols
- Withdrawal delays and limits

### The Opportunity

StellarSwap fills the infrastructure gap: a permissionless, composable, fee-generating AMM on Stellar that serves as foundational DeFi rails for the ecosystem.

---

## 4. Core Features

### 4.1 Liquidity Pools

Each pool is a Soroban smart contract instance holding reserves of exactly two tokens. Pools are:
- **Permissionless**: anyone can create a pool for any token pair
- **Immutable**: core pool logic cannot be upgraded after deployment
- **Non-custodial**: reserves are held by the contract, not any operator
- **Symmetric**: both tokens in a pair have equal standing

### 4.2 LP Tokens

When a user adds liquidity, they receive LP tokens minted proportionally to their contribution. LP tokens:
- Are standard SEP-41-compatible Soroban tokens
- Represent a fractional claim on pool reserves
- Accumulate fee value passively (fees increase reserves without minting new LP tokens)
- Can be burned at any time to withdraw the underlying tokens

**First liquidity mint formula:**
```
lp_minted = sqrt(amount_x * amount_y) - MINIMUM_LIQUIDITY
```
The `MINIMUM_LIQUIDITY` (1000 units) is permanently locked to prevent pool manipulation.

**Subsequent mint formula:**
```
lp_minted = min(
  (amount_x * total_supply) / reserve_x,
  (amount_y * total_supply) / reserve_y
)
```

### 4.3 Constant Product AMM

The core invariant: `reserve_x * reserve_y = k`

After every swap, `k` must be ≥ its value before the swap (it increases slightly due to fees). This mathematical property:
- Guarantees liquidity at all prices (asymptotic, never reaches zero)
- Creates automatic price discovery
- Prevents sandwich attacks from being trivially profitable (price impact exists)

### 4.4 Add Liquidity

Users deposit token A and token B in the current pool ratio. The function:
1. Calculates optimal amounts to maintain the ratio
2. Transfers tokens from user to pool
3. Mints LP tokens to user
4. Updates reserves
5. Emits a `liquidity_added` event

### 4.5 Remove Liquidity

Users burn LP tokens to receive proportional reserves. The function:
1. Calculates token amounts proportional to LP share
2. Burns LP tokens
3. Transfers tokens from pool to user
4. Updates reserves
5. Emits a `liquidity_removed` event

### 4.6 Token Swaps

Users specify an input token and amount; the contract calculates and delivers the output. The function:
1. Validates the swap parameters and deadline
2. Calculates `amount_out` using the swap formula
3. Validates `amount_out >= amount_out_min` (slippage protection)
4. Transfers input token from user to pool
5. Transfers output token from pool to user
6. Updates reserves
7. Verifies the invariant holds
8. Emits a `swap` event

### 4.7 Fee Distribution

0.3% fee on every swap. Fees are **not** collected separately — they increase pool reserves:
- Input: `amount_in * 997 / 1000` (effective amount after 0.3% fee)
- The fee portion stays in the pool, increasing `k`
- LPs benefit when they remove liquidity: their share of larger reserves yields more tokens

### 4.8 Slippage Protection

Every swap accepts an `amount_out_min` parameter. The transaction reverts if the actual output is below this threshold. This protects traders from:
- Price movement between quote and execution
- Front-running / sandwich attacks
- Unexpected pool state changes

### 4.9 Multi-Hop Swaps

The Router contract supports paths like: `TOKEN_A → TOKEN_B → TOKEN_C`

This allows swapping between any two tokens even without a direct pool, as long as intermediate pools exist. The router chains swap calls across pairs.

### 4.10 Router Architecture

The Router is the user-facing entry point. It:
- Abstracts pair address lookup (calls Factory)
- Handles path routing for multi-hop swaps
- Calculates optimal amounts
- Provides helper functions: `get_amount_out`, `get_amounts_out`, `quote`
- Is stateless (no storage of its own)

### 4.11 Stellar Asset Compatibility

The protocol supports:
- **Soroban tokens**: custom tokens following the SEP-41 interface
- **Stellar Classic assets wrapped as Soroban tokens**: via the Stellar Asset Contract (SAC)
- **USDC, XLM, and other major Stellar assets** out of the box via SAC addresses

---

## 5. Technical Architecture

### 5.1 Factory Contract

**Role**: Pool registry and creation hub.

**Responsibilities**:
- Maintains a mapping of `(token_a, token_b) → pair_address`
- Creates new Pair contracts via `create_pair(token_a, token_b)`
- Normalizes token order (lower address first) for canonical pair lookup
- Maintains a list of all pairs for indexing
- Holds the protocol fee recipient address (for future governance)

**Storage layout**:
```
Instance storage:
  - admin: Address
  - fee_to: Option<Address>
  - fee_to_setter: Address
  - all_pairs: Vec<Address>

Persistent storage:
  - pairs: Map<(Address, Address), Address>  // canonical order
```

**Key invariant**: `pairs.get((a, b)) == pairs.get((b, a))` — pair lookup is token-order independent.

### 5.2 Pair Contract

**Role**: Core AMM pool holding reserves and implementing the invariant.

**Responsibilities**:
- Holds token reserves (`reserve_x`, `reserve_y`)
- Implements `add_liquidity`, `remove_liquidity`, `swap`
- Manages LP token minting and burning
- Enforces the constant product invariant
- Emits events for all state changes
- Extends storage TTL on every interaction

**Storage layout**:
```
Instance storage:
  - token_x: Address
  - token_y: Address
  - reserve_x: i128
  - reserve_y: i128
  - total_supply: i128
  - k_last: i128         // for protocol fee calculation
  - factory: Address
  - lp_token: Address

Persistent storage:
  - balances: Map<Address, i128>  // LP token balances
```

**Note on Soroban storage**: We use Instance storage for reserves (accessed every call) and Persistent storage for LP balances (accessed per-user). This optimizes ledger read costs.

### 5.3 Router Contract

**Role**: Stateless user-facing interface for swaps and liquidity operations.

**Responsibilities**:
- `add_liquidity(token_a, token_b, amount_a_desired, amount_b_desired, amount_a_min, amount_b_min, to, deadline)`
- `remove_liquidity(token_a, token_b, liquidity, amount_a_min, amount_b_min, to, deadline)`
- `swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)`
- `swap_tokens_for_exact_tokens(amount_out, amount_in_max, path, to, deadline)`
- `get_amount_out(amount_in, reserve_in, reserve_out) → i128`
- `get_amounts_out(amount_in, path) → Vec<i128>`
- `quote(amount_a, reserve_a, reserve_b) → i128`

**Stateless design**: The Router holds no persistent state. All state lives in Pair and Factory contracts. This means the Router can be upgraded or replaced without migrating state.

### 5.4 LP Token System

LP tokens are implemented as SEP-41-compatible Soroban tokens embedded within the Pair contract (or as a separate token contract initialized by the Pair). Each Pair has its own LP token with:
- `name`: "StellarSwap LP Token"
- `symbol`: "SLP-{token_x_symbol}-{token_y_symbol}"
- `decimals`: 7 (matching Stellar's standard)

LP tokens can be transferred, used as collateral in lending protocols, or held in multi-sig accounts.

### 5.5 Storage Model

Soroban storage types used:

| Type | TTL Behavior | Use Case |
|------|-------------|----------|
| Instance | Tied to contract instance | Core contract state, addresses |
| Persistent | Explicit TTL, survives archival | LP balances, pair registry |
| Temporary | Expires each ledger | Intermediate computation state |

**TTL Extension Strategy**: Every contract call that reads/writes state will extend TTLs to ensure state doesn't expire. We use a `LEDGER_BUMP` constant (e.g., 535,000 ledgers ≈ 90 days on Stellar) for periodic bumps.

### 5.6 Reserve Synchronization

After every swap or liquidity change:
1. Actual token balances are queried from the token contracts
2. Reserves are updated to match actual balances
3. This prevents reserve drift from unexpected token transfers
4. The `sync()` function can be called permissionlessly to resync reserves

### 5.7 Event Architecture

Every significant state change emits a Soroban event:

| Event | Topics | Data |
|-------|--------|------|
| `swap` | `["swap", pool_address]` | `{from, amount_in, amount_out, token_in, token_out}` |
| `liquidity_added` | `["liquidity_added", pool_address]` | `{provider, amount_x, amount_y, lp_minted}` |
| `liquidity_removed` | `["liquidity_removed", pool_address]` | `{provider, amount_x, amount_y, lp_burned}` |
| `pair_created` | `["pair_created", factory_address]` | `{token_x, token_y, pair_address, pair_count}` |
| `sync` | `["sync", pool_address]` | `{reserve_x, reserve_y}` |

Events are queryable via Horizon's event streaming API.

### 5.8 Indexing Strategy

Events from the contracts are indexed by:
1. **Horizon API**: Native Soroban event streaming (real-time)
2. **Custom Indexer**: Node.js service subscribing to Horizon SSE, persisting to PostgreSQL
3. **Subgraph-style queries**: REST API over indexed data for TVL, volume, price history

### 5.9 Soroban-Specific Design Decisions

- **No reentrancy guards needed**: Soroban's execution model is single-call-frame per transaction. Cross-contract calls are synchronous and don't yield control between frames, eliminating classic reentrancy.
- **Authorization model**: We use `require_auth()` on the caller rather than ERC-20's approve/transferFrom pattern.
- **Deterministic addressing**: Contract addresses are derived from the deployer's address and a salt, enabling counterfactual pair address computation.
- **WASM limits**: Each contract call is bounded by CPU instruction limits and memory limits. Our math operations are i128-based to stay well within limits.

---

## 6. Mathematical Model

### 6.1 The Constant Product Invariant

```
x * y = k
```

Where:
- `x` = reserve of token X
- `y` = reserve of token Y  
- `k` = constant (the product of reserves)

**Property**: After any swap, `k` must equal or exceed its pre-swap value. It increases over time due to fees.

### 6.2 Swap Pricing Formula

Given:
- `amount_in`: tokens being sold by the trader
- `reserve_in`: pool reserve of the input token
- `reserve_out`: pool reserve of the output token
- Fee: 0.3% (997/1000 after fee)

```
amount_in_with_fee = amount_in * 997
numerator          = amount_in_with_fee * reserve_out
denominator        = (reserve_in * 1000) + amount_in_with_fee

amount_out = numerator / denominator
```

**Why this works**: The fee is taken by reducing the effective input. The trader pays 0.3% which remains in the pool, growing `k`:

```
(reserve_in + amount_in * 0.997) * (reserve_out - amount_out) >= reserve_in * reserve_out
```

### 6.3 Deriving the Formula from the Invariant

Starting from: `x' * y' = k' >= k`

Where:
- `x' = reserve_in + amount_in_effective`
- `y' = reserve_out - amount_out`
- `amount_in_effective = amount_in * 997 / 1000`

Solving for `amount_out`:
```
amount_out = (reserve_out * amount_in_effective) / (reserve_in + amount_in_effective)
```

Substituting (and using integer arithmetic to avoid division before multiplication):
```
amount_out = (reserve_out * amount_in * 997) / (reserve_in * 1000 + amount_in * 997)
```

### 6.4 Price Impact

Price impact measures how much a trade moves the pool price:

```
spot_price_before = reserve_out / reserve_in
spot_price_after  = (reserve_out - amount_out) / (reserve_in + amount_in)

price_impact = 1 - (spot_price_after / spot_price_before)
             ≈ amount_in / (reserve_in + amount_in)
```

For small trades relative to pool size, price impact is negligible. For large trades, it increases significantly — this is "slippage".

### 6.5 Reserve Balancing (Add Liquidity)

When adding liquidity after the first deposit:

```
amount_b_optimal = (amount_a * reserve_b) / reserve_a

if amount_b_optimal <= amount_b_desired:
    use (amount_a, amount_b_optimal)
else:
    amount_a_optimal = (amount_b * reserve_a) / reserve_b
    use (amount_a_optimal, amount_b)
```

This ensures deposits maintain the current price ratio.

### 6.6 LP Token Minting

**First deposit** (pool initialization):
```
lp_minted = sqrt(amount_x * amount_y) - MINIMUM_LIQUIDITY
MINIMUM_LIQUIDITY = 1000  // burned to zero address permanently
```

The geometric mean ensures fair pricing regardless of deposit token ratio.

**Subsequent deposits**:
```
lp_minted = min(
  amount_x * total_lp_supply / reserve_x,
  amount_y * total_lp_supply / reserve_y
)
```

Using the minimum disincentivizes imbalanced deposits.

### 6.7 LP Token Redemption

When burning LP tokens:
```
amount_x_out = lp_burned * reserve_x / total_lp_supply
amount_y_out = lp_burned * reserve_y / total_lp_supply
```

Fees earned since deposit are embedded in larger reserves — the same LP share now claims more tokens.

### 6.8 Fee Accounting

Fee revenue is captured implicitly:
- Every swap: `k_after > k_before` (due to fee retained in pool)
- Every block: reserves grow slightly relative to LP supply
- At withdrawal: LP tokens redeem more than originally deposited

**Annualized LP yield estimate**:
```
APY ≈ (daily_volume * 0.003 / TVL) * 365
```

### 6.9 Quote Function

For a given amount of token A, what's the equivalent amount of token B at current price?

```
quote(amount_a, reserve_a, reserve_b) = amount_a * reserve_b / reserve_a
```

This assumes no price impact — useful for estimating proportional deposit amounts.

### 6.10 Integer Math Considerations

All math uses `i128` in Rust/Soroban:
- Maximum value: 2^127 - 1 ≈ 1.7 × 10^38
- Stellar token amounts use 7 decimal places (stroops)
- Maximum realistic reserve: 10^15 tokens × 10^7 stroops = 10^22 stroops
- Maximum intermediate: 10^22 * 10^22 = 10^44 — **overflows i128**

**Solution**: For the invariant check, we restructure multiplication order and use `checked_mul` with early panic on overflow. For the swap formula, intermediate products are bounded by our reserve caps (1 trillion tokens per side), keeping products within i128 range.

**Reserve cap**: We enforce `reserve ≤ MAX_RESERVE = 10^26 stroops` to ensure all intermediate calculations stay within i128.

---

## 7. Security Design

### 7.1 Reentrancy

**Risk**: Malicious token contract calls back into the Pair contract during a transfer.

**Mitigation**: Soroban's call model is single-frame — cross-contract calls are synchronous and cannot yield control back to the original caller mid-execution. Classic reentrancy is not possible.

**Additional defense**: We follow Checks-Effects-Interactions pattern anyway: all state updates (reserve changes, LP minting) occur before external token transfers.

### 7.2 Slippage Validation

**Risk**: Trader receives significantly less than expected due to front-running or price movement.

**Mitigation**:
- All swap functions accept `amount_out_min` parameter
- Transaction reverts if `actual_amount_out < amount_out_min`
- Frontend should default to 0.5% slippage tolerance
- Users can set custom slippage tolerance

### 7.3 Deadline Checks

**Risk**: Stale transactions executing in unfavorable market conditions.

**Mitigation**:
- All user-facing functions accept a `deadline: u64` (Unix timestamp)
- Transaction reverts if `current_ledger_timestamp > deadline`
- Prevents pending transactions from executing long after submission

### 7.4 Overflow Prevention

**Risk**: Integer overflow producing incorrect calculations.

**Mitigation**:
- All arithmetic uses `checked_mul`, `checked_add`, `checked_sub`
- Panic on overflow — transaction fails rather than proceeding with wrong state
- Reserve cap (`MAX_RESERVE`) prevents reserves from growing large enough to cause overflow in the swap formula

### 7.5 Reserve Validation

**Risk**: Reserves are inconsistent with actual token balances.

**Mitigation**:
- After every swap, actual balances are queried and stored as new reserves
- The `sync()` function allows permissionless reserve resyncing
- Invariant check at end of every swap: `reserve_x_new * reserve_y_new >= reserve_x_old * reserve_y_old`

### 7.6 Invalid Pair Prevention

**Risk**: Creating pools with invalid or identical tokens.

**Mitigation**:
- Factory rejects `create_pair(token_a, token_b)` if `token_a == token_b`
- Factory rejects creation of a pair that already exists
- Token addresses are validated as contract addresses

### 7.7 Zero Liquidity Protection

**Risk**: Division by zero when pool is empty.

**Mitigation**:
- Swaps revert if either reserve is zero
- `MINIMUM_LIQUIDITY` is permanently locked on first deposit, preventing the pool from ever reaching zero reserves
- Add liquidity reverts if minted LP would be zero (deposit too small)

### 7.8 Economic Attack Analysis

#### Price Oracle Manipulation
**Risk**: Attacker manipulates pool price within a block to exploit downstream oracle consumers.

**Mitigation (MVP)**: We do not expose an on-chain TWAP oracle in MVP. Price data is available off-chain via event indexer. Future version will implement Uniswap V2-style TWAP accumulators.

#### Sandwich Attacks
**Risk**: MEV bot front-runs a large swap, profiting from slippage.

**Mitigation**: Slippage protection (`amount_out_min`) limits attacker profit. On Stellar, transaction ordering within a ledger is not currently manipulable by validators in a predictable way (SCP consensus), reducing MEV compared to Ethereum.

#### Flash Loan Attacks
**Risk**: Borrowing large amounts to manipulate prices within a single transaction.

**Mitigation**: Soroban does not support flash loan callbacks in the same way as EVM (no `executeOperation` callback pattern). Pool invariant check at end of every call prevents temporary reserve violations.

#### LP Token Inflation Attack (First Deposit)
**Risk**: First depositor manipulates initial price by depositing imbalanced amounts, causing subsequent LPs to lose funds.

**Mitigation**: `MINIMUM_LIQUIDITY` (1000 units burned to dead address) ensures the geometric mean formula produces a fair initial LP token price. Imbalanced first deposits result in a poor price — subsequent depositors correct it via arbitrage.

#### Denial of Service
**Risk**: Attacker makes pool unusable via spam or state manipulation.

**Mitigation**: No admin functions that can pause/lock pools (immutable). Ledger TTL extensions prevent state expiration. Reserve sync is permissionless.

### 7.9 Trust Model

- **Users** trust the smart contract code (auditable, open source)
- **Factory admin** can set `fee_to` address to receive protocol fees (future feature)
- **No upgrade keys**: Pair contracts are immutable. Router can be upgraded; users should verify Router address.
- **Zero operator custody**: No entity holds user funds. All value is in contract-controlled reserves.

---

## 8. Repository & Monorepo Structure

```
stellarswap/
│
├── contracts/                          # Soroban smart contracts (Rust)
│   ├── factory/                        # Factory contract
│   │   ├── src/
│   │   │   ├── lib.rs                  # Contract entry point
│   │   │   ├── contract.rs             # Factory logic
│   │   │   ├── storage.rs              # Storage key definitions
│   │   │   ├── events.rs               # Event emission helpers
│   │   │   └── test.rs                 # Unit tests
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   ├── pair/                           # Pair/AMM core contract
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── contract.rs             # AMM logic
│   │   │   ├── math.rs                 # Swap formula, invariant checks
│   │   │   ├── lp_token.rs             # LP token mint/burn
│   │   │   ├── storage.rs
│   │   │   ├── events.rs
│   │   │   └── test.rs
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   ├── router/                         # Router contract (stateless)
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── contract.rs             # Routing logic
│   │   │   ├── helpers.rs              # Amount calculation helpers
│   │   │   ├── storage.rs
│   │   │   └── test.rs
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   ├── token/                          # Reference SEP-41 token (for testing)
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── contract.rs
│   │   │   └── test.rs
│   │   ├── Cargo.toml
│   │   └── README.md
│   │
│   └── shared/                         # Shared types and utilities
│       ├── src/
│       │   ├── lib.rs
│       │   ├── types.rs                # Shared data types
│       │   ├── errors.rs               # Error enum
│       │   └── math.rs                 # Shared math utilities
│       └── Cargo.toml
│
├── sdk/                                # Client SDKs
│   ├── typescript/                     # TypeScript SDK
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── factory.ts              # Factory contract client
│   │   │   ├── pair.ts                 # Pair contract client
│   │   │   ├── router.ts               # Router contract client
│   │   │   ├── math.ts                 # Client-side math utilities
│   │   │   ├── types.ts                # TypeScript types
│   │   │   └── utils/
│   │   │       ├── stellar.ts          # Stellar SDK helpers
│   │   │       └── token.ts            # Token utilities
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── README.md
│   │
│   └── rust/                           # Rust SDK (optional, for bots)
│       ├── src/
│       │   └── lib.rs
│       └── Cargo.toml
│
├── frontend/                           # Next.js frontend
│   ├── src/
│   │   ├── app/                        # Next.js App Router
│   │   │   ├── page.tsx                # Home / Swap page
│   │   │   ├── liquidity/
│   │   │   │   └── page.tsx
│   │   │   ├── pools/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── swap/
│   │   │   │   ├── SwapForm.tsx
│   │   │   │   ├── TokenSelect.tsx
│   │   │   │   └── SlippageSettings.tsx
│   │   │   ├── liquidity/
│   │   │   │   ├── AddLiquidity.tsx
│   │   │   │   └── RemoveLiquidity.tsx
│   │   │   ├── pools/
│   │   │   │   └── PoolTable.tsx
│   │   │   └── shared/
│   │   │       ├── WalletConnect.tsx
│   │   │       ├── TransactionModal.tsx
│   │   │       └── TokenIcon.tsx
│   │   ├── hooks/
│   │   │   ├── useSwap.ts
│   │   │   ├── useLiquidity.ts
│   │   │   └── useWallet.ts
│   │   ├── lib/
│   │   │   ├── sdk.ts                  # SDK initialization
│   │   │   └── constants.ts
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── README.md
│
├── indexer/                            # Event indexer service
│   ├── src/
│   │   ├── index.ts                    # Entry point
│   │   ├── horizon.ts                  # Horizon event subscription
│   │   ├── processors/
│   │   │   ├── swap.ts
│   │   │   ├── liquidity.ts
│   │   │   └── pair.ts
│   │   ├── db/
│   │   │   ├── schema.ts               # Database schema
│   │   │   ├── migrations/
│   │   │   └── queries.ts
│   │   └── api/
│   │       ├── server.ts               # REST API
│   │       └── routes/
│   │           ├── pairs.ts
│   │           ├── swaps.ts
│   │           └── analytics.ts
│   ├── package.json
│   └── README.md
│
├── scripts/                            # Deployment and utility scripts
│   ├── deploy/
│   │   ├── deploy_factory.sh
│   │   ├── deploy_pair.sh
│   │   ├── deploy_router.sh
│   │   └── deploy_all.sh
│   ├── seed/
│   │   ├── create_pools.ts             # Pool creation scripts
│   │   └── seed_liquidity.ts           # Initial liquidity seeding
│   ├── verify/
│   │   └── verify_contracts.ts         # Post-deploy verification
│   └── utils/
│       └── stellar_cli_helpers.sh
│
├── tests/                              # Integration and e2e tests
│   ├── integration/
│   │   ├── factory.test.ts
│   │   ├── pair.test.ts
│   │   ├── router.test.ts
│   │   └── multi_hop.test.ts
│   ├── fuzz/
│   │   └── swap_fuzz.rs                # Fuzz tests via cargo-fuzz
│   ├── simulation/
│   │   └── economic_simulation.ts      # LP economics simulation
│   └── fixtures/
│       └── tokens.ts
│
├── infra/                              # Infrastructure configuration
│   ├── docker/
│   │   ├── docker-compose.yml          # Local dev stack
│   │   ├── Dockerfile.indexer
│   │   └── Dockerfile.frontend
│   ├── postgres/
│   │   └── init.sql
│   └── monitoring/
│       ├── prometheus.yml
│       └── grafana/
│           └── dashboard.json
│
├── config/                             # Environment configuration
│   ├── testnet.json                    # Testnet contract addresses
│   ├── mainnet.json                    # (future) Mainnet addresses
│   └── local.json                      # Local dev addresses
│
├── docs/                               # Extended documentation
│   ├── contracts/
│   │   ├── factory.md
│   │   ├── pair.md
│   │   └── router.md
│   ├── guides/
│   │   ├── getting_started.md
│   │   ├── add_liquidity.md
│   │   └── integrate_sdk.md
│   ├── diagrams/
│   │   ├── system_overview.png
│   │   └── swap_flow.png
│   └── audit/
│       └── audit_prep.md
│
├── assets/                             # Static assets
│   └── logo/
│
├── .github/                            # GitHub Actions CI/CD
│   └── workflows/
│       ├── test.yml
│       ├── build.yml
│       └── deploy.yml
│
├── PRD.md                              # This document
├── ROADMAP.md                          # Development phases
├── ARCHITECTURE.md                     # System architecture
├── SECURITY.md                         # Security analysis
├── TESTING.md                          # Testing strategy
├── DEPLOYMENT.md                       # Deployment guide
├── CONTRIBUTING.md                     # Contribution guidelines
├── Cargo.toml                          # Workspace Cargo config
├── Cargo.lock
├── package.json                        # Root package.json (workspaces)
└── README.md                           # Project overview
```

### Folder Purpose Summary

| Folder | Purpose |
|--------|---------|
| `contracts/` | All Soroban smart contracts in Rust. Each contract is an isolated workspace member. |
| `contracts/shared/` | Shared types, error codes, and math utilities imported by all contracts. |
| `sdk/typescript/` | TypeScript SDK for frontend and external developer integration. |
| `sdk/rust/` | Rust SDK for trading bots and backend services. |
| `frontend/` | Next.js application providing the swap and liquidity UI. |
| `indexer/` | Off-chain event indexer that reads Horizon events and stores analytics data. |
| `scripts/` | Deployment, seeding, and verification scripts. |
| `tests/` | Integration and end-to-end tests (Soroban unit tests live alongside contracts). |
| `infra/` | Docker Compose for local development, monitoring configuration. |
| `config/` | Per-environment contract addresses and configuration. |
| `docs/` | Extended documentation, guides, and audit prep materials. |
| `.github/` | CI/CD workflows for testing and deployment. |

---

## 9. Acceptance Criteria

### Smart Contracts
- [ ] Factory creates pools for any valid token pair
- [ ] Pair enforces constant product invariant on every swap
- [ ] LP tokens mint correctly on first and subsequent deposits
- [ ] LP tokens burn correctly and return proportional reserves
- [ ] Swap fees of exactly 0.3% are retained in pool
- [ ] Slippage protection reverts transactions outside tolerance
- [ ] Deadline validation reverts stale transactions
- [ ] All events emit correctly with accurate data
- [ ] Integer overflow is impossible given MAX_RESERVE constraints
- [ ] All unit tests pass
- [ ] All integration tests pass

### SDK
- [ ] TypeScript SDK wraps all contract functions
- [ ] Math utilities match contract calculations exactly
- [ ] Transaction builders produce valid Soroban transactions

### Frontend
- [ ] Swap form quotes prices and executes swaps
- [ ] Liquidity UI supports add and remove operations
- [ ] Pool explorer shows all active pools
- [ ] Freighter wallet integration works end-to-end
- [ ] Slippage settings persist across sessions

### Deployment
- [ ] All contracts deployable to testnet via scripts
- [ ] Post-deployment verification confirms contract state
- [ ] Initial liquidity seeding script works end-to-end

---

## 10. Non-Goals (MVP Scope)

The following are explicitly **not** in scope for MVP:

- **Concentrated liquidity**: Uniswap V3-style range positions
- **TWAP oracle**: On-chain time-weighted average price accumulator
- **Protocol fee**: Governance-controlled fee switch (infrastructure is there, switch is off)
- **Yield farming**: LP staking rewards
- **Limit orders**: Order book integration
- **Permit signatures**: Gasless approvals
- **Cross-chain**: Bridge or cross-chain swap support
- **Mobile app**: Native iOS/Android
- **Mainnet deployment**: Production launch (testnet only)
- **DAO governance**: Token-weighted governance
- **Flash loans**: Uncollateralized flash lending

---

*End of PRD — Version 1.0.0*
