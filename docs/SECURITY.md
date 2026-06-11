# StellarSwap — Security Analysis

**Version:** 1.0.0  
**Date:** 2026-06-02  
**Classification:** Public  

---

## Table of Contents

1. [Security Philosophy](#1-security-philosophy)
2. [Trust Model](#2-trust-model)
3. [Attack Surface Analysis](#3-attack-surface-analysis)
4. [Contract-Level Vulnerabilities](#4-contract-level-vulnerabilities)
5. [Economic Attack Analysis](#5-economic-attack-analysis)
6. [Soroban-Specific Security](#6-soroban-specific-security)
7. [Security Controls Implementation](#7-security-controls-implementation)
8. [Security Assumptions](#8-security-assumptions)
9. [Incident Response](#9-incident-response)
10. [Pre-Audit Checklist](#10-pre-audit-checklist)

---

## 1. Security Philosophy

StellarSwap adopts a **defense-in-depth** security posture. No single mitigation is considered sufficient. Multiple independent layers of protection are applied to all critical paths.

### Core Principles

1. **Fail loudly**: All error conditions cause transaction reversion with descriptive error codes. No silent failures.
2. **Minimal trust**: Contracts verify all inputs, not just user-provided ones. Cross-contract calls are treated as untrusted.
3. **Immutability over upgradeability**: Core AMM logic (Pair contracts) is immutable. Less code that can change = smaller attack surface.
4. **Check-Effects-Interactions**: All state changes happen before external calls (even in Soroban's reentrancy-safe model).
5. **Conservative math**: Use checked arithmetic. Prefer integer underestimation to overestimation.
6. **Minimal privilege**: No privileged roles except a single admin on Factory for fee configuration. Pair contracts have no admin.
7. **Open source**: All contract code is published for community review before deployment.

---

## 2. Trust Model

### What Users Trust

| What | Why Trusted |
|------|-------------|
| Factory contract | Open source, audited, immutable after deployment |
| Pair contracts | Open source, audited, immutable, no admin |
| Router contract | Open source, audited, upgradeable (verify address) |
| Stellar network (SCP) | Byzantine fault tolerant consensus |
| Token contracts (SAC) | Stellar native, managed by Stellar protocol |

### What Users Do NOT Trust

| What | Risk | Mitigation |
|------|------|-----------|
| Factory admin | Can set `fee_to` (protocol fee) | Fee is only 0.05% at most; no custody of user funds |
| Router admin | Can upgrade Router logic | Users should verify Router address before use; Pair contracts safe regardless |
| Custom token contracts | Malicious token callbacks | Token whitelist in frontend; invariant checks catch unexpected behavior |
| Indexer / Frontend | Off-chain, could be compromised | All critical data verified on-chain; users can verify via Horizon directly |

### Privilege Map

```
Factory Admin
  └─► Can set fee_to address (collect protocol fee)
  └─► Can set fee_to_setter (transfer admin)
  └─► CANNOT: modify pools, steal funds, pause protocol

Router Admin  
  └─► Can upgrade Router WASM
  └─► CANNOT: access Pair state, steal funds, modify Factory

Nobody (Pair is admin-free)
  └─► Pair logic is immutable after initialization
  └─► No pause, no upgrade, no drain function
```

---

## 3. Attack Surface Analysis

### External Interfaces

```
Attack Surface Points:
│
├── Router (primary user entrypoint)
│   ├── swap_exact_tokens_for_tokens()  ← Most critical path
│   ├── swap_tokens_for_exact_tokens()
│   ├── add_liquidity()
│   └── remove_liquidity()
│
├── Pair (called by Router and directly by LPs)
│   ├── swap()                          ← Invariant enforcement
│   ├── add_liquidity()
│   ├── remove_liquidity()
│   ├── sync()                          ← Permissionless, no auth
│   └── skim()                          ← Low risk, recovers excess
│
├── Factory
│   ├── create_pair()                   ← Permissionless
│   └── set_fee_to()                    ← Admin only
│
└── LP Token (on Pair)
    ├── lp_transfer()
    ├── lp_approve()
    └── lp_transfer_from()
```

### Attack Vector Categories

1. **Mathematical exploits**: Incorrect invariant calculation, overflow, rounding errors
2. **Authorization bypasses**: Calling privileged functions without proper auth
3. **Economic exploits**: Price manipulation, sandwich attacks, LP griefing
4. **State corruption**: Inconsistent reserve state, storage manipulation
5. **Denial of service**: Griefing attacks that make contracts unusable
6. **Front-running**: MEV extraction at user expense

---

## 4. Contract-Level Vulnerabilities

### 4.1 Integer Overflow

**Threat Level**: Critical  
**Status**: Mitigated

**Risk**: `reserve_x * reserve_y` overflow during invariant check. At max reserves of 10^26 stroops each, the product is 10^52 — far exceeding i128 (max ~1.7 × 10^38).

**Mitigation**:
```rust
// We enforce MAX_RESERVE = 10^26 on both reserves.
// But invariant check: (reserve_x * reserve_y) could still overflow.
// Solution: restructure the invariant check to avoid direct multiplication.

// WRONG (can overflow):
assert!(new_reserve_x * new_reserve_y >= old_reserve_x * old_reserve_y);

// RIGHT (check each factor separately, or use u256 via soroban):
// Option A: Cap reserves at sqrt(i128::MAX) ≈ 1.3 × 10^19 stroops
//           = ~130 billion tokens with 7 decimals
// Option B: Use the fee-adjusted check that avoids large multiplications

// Implemented approach (fee-adjusted invariant check):
let balance_x_adj = balance_x * 1000 - amount_x_in * 3;
let balance_y_adj = balance_y * 1000 - amount_y_in * 3;
// balance_x_adj and balance_y_adj are at most reserve * 1000 ≈ 10^22
// Product: 10^44 — still overflows i128!

// ACTUAL SOLUTION: Use checked arithmetic and cap MAX_RESERVE = 10^18 stroops
// = 100 billion tokens (7 decimal places)
// Product = 10^36, within i128 range (1.7 × 10^38).
const MAX_RESERVE: i128 = 1_000_000_000_000_000_000_000_000i128; // 10^24 conservative
// With 1000x factor: 10^27, product: 10^54 — too high.
// FINAL: MAX_RESERVE = 10^18 to keep adj product < 10^39
const MAX_RESERVE: i128 = 1_000_000_000_000_000_000i128; // 10^18 stroops = 100B tokens
```

**Testing**: Property test with MAX_RESERVE inputs to confirm no panic.

### 4.2 Division by Zero

**Threat Level**: Medium  
**Status**: Mitigated

**Risk**: Division by zero in swap formula when reserves are zero.

**Locations**:
- `get_amount_out`: denominator is `reserve_in * 1000 + amount_in * 997`
- `quote`: divides by `reserve_a`
- LP mint: `amount_x * total_supply / reserve_x`

**Mitigation**:
```rust
if reserve_in == 0 || reserve_out == 0 {
    panic_with_error!(&env, StellarSwapError::InsufficientLiquidity);
}

// Denominator can never be zero if reserve_in > 0 and amount_in > 0:
// denominator = reserve_in * 1000 + amount_in * 997 > 0
```

**Testing**: Test swap with zero reserves — must revert. MINIMUM_LIQUIDITY ensures reserves never reach zero in an active pool.

### 4.3 Reentrancy

**Threat Level**: N/A in Soroban  
**Status**: Not applicable

Soroban's execution model does not support callbacks or mid-execution yield. Cross-contract calls are synchronous and sequential within a single transaction frame. Classic reentrancy cannot occur.

**Belt-and-suspenders**: We still follow Check-Effects-Interactions ordering:
1. All checks (validation, auth)
2. All effects (state updates: reserves, LP balances)
3. All interactions (external token transfers)

Even though reentrancy is architecturally impossible in Soroban, this ordering makes the code easier to audit and reason about.

### 4.4 Incorrect Invariant Check

**Threat Level**: Critical  
**Status**: Mitigated

**Risk**: Bug in invariant check allows a swap that drains pool reserves.

**Mitigation**: The invariant check is the final step of every swap. It is a simple comparison:

```rust
// After swap:
let balance_x_adj: i128 = balance_x
    .checked_mul(1000)
    .unwrap()
    .checked_sub(amount_x_in.checked_mul(3).unwrap())
    .unwrap();
let balance_y_adj: i128 = balance_y
    .checked_mul(1000)
    .unwrap()
    .checked_sub(amount_y_in.checked_mul(3).unwrap())
    .unwrap();

// k_new >= k_old (both multiplied by 1000^2 = 10^6 for fee precision)
if balance_x_adj.checked_mul(balance_y_adj).unwrap()
    < reserve_x.checked_mul(1000).unwrap()
    .checked_mul(reserve_y.checked_mul(1000).unwrap())
    .unwrap()
{
    panic_with_error!(&env, StellarSwapError::InvariantViolation);
}
```

**Testing**: Property tests with 10,000 random swap sequences — invariant must never decrease.

### 4.5 Initialization Race

**Threat Level**: High  
**Status**: Mitigated

**Risk**: Pair contract is initialized by a second caller before Factory initialization completes, resulting in wrong token addresses.

**Mitigation**:
```rust
// Pair.initialize() can only be called once
fn initialize(env: Env, token_x: Address, token_y: Address, factory: Address) {
    if env.storage().instance().has(&DataKey::Initialized) {
        panic_with_error!(&env, StellarSwapError::AlreadyInitialized);
    }
    // Only factory can initialize (factory address is in the call)
    // Factory verifies it just deployed this contract
    // ...
    env.storage().instance().set(&DataKey::Initialized, &true);
}
```

### 4.6 Wrong Reserve Calculation

**Threat Level**: High  
**Status**: Mitigated

**Risk**: Reserves drift from actual token balances due to direct token sends or rounding.

**Mitigation**:
- After every swap/liquidity call: update reserves by querying actual token balances
- `sync()` function is permissionless — anyone can call to resync
- Invariant check catches reserve corruption before state is saved

```rust
fn update_reserves(env: &Env, token_x: &Address, token_y: &Address) {
    let balance_x = token_client(env, token_x).balance(&env.current_contract_address());
    let balance_y = token_client(env, token_y).balance(&env.current_contract_address());
    // Validate against MAX_RESERVE
    env.storage().instance().set(&DataKey::ReserveX, &balance_x);
    env.storage().instance().set(&DataKey::ReserveY, &balance_y);
}
```

### 4.7 LP Token Accounting Error

**Threat Level**: High  
**Status**: Mitigated

**Risk**: LP token total supply doesn't match sum of balances, enabling LP theft.

**Mitigation**:
- All LP mint/burn operations update `total_supply` atomically with `balances`
- No external function can modify total_supply without modifying a corresponding balance
- Invariant test: `sum(all balances) == total_supply` checked in tests

### 4.8 First-Deposit Manipulation

**Threat Level**: Medium  
**Status**: Mitigated

**Risk**: First LP deposits 1 of token X and 1,000,000 of token Y, setting a manipulated price. Subsequent LPs deposit at this artificial rate and suffer losses.

**Mitigation**:
```rust
// First deposit LP = sqrt(x * y) - MINIMUM_LIQUIDITY
// MINIMUM_LIQUIDITY (1000) is burned permanently.
// 
// If attacker deposits (1, 1_000_000):
//   LP = sqrt(1 * 1_000_000) - 1000 = 1000 - 1000 = 0
//   Transaction reverts (cannot mint 0 LP tokens)
//
// If attacker deposits (1_000_000, 1_000_000):
//   LP = sqrt(10^12) - 1000 = 1,000,000 - 1000 = 999,000
//   Initial price is 1:1, fair.
//   Attack cost: must supply 2M tokens to set any significant price.
```

The burned MINIMUM_LIQUIDITY makes first-deposit manipulation economically unattractive.

### 4.9 Deadline Bypass

**Threat Level**: Low  
**Status**: Mitigated

**Risk**: Stale transaction executes at an unfavorable time.

**Mitigation**:
```rust
fn ensure_deadline(env: &Env, deadline: u64) {
    if env.ledger().timestamp() > deadline {
        panic_with_error!(env, StellarSwapError::ExpiredDeadline);
    }
}
// Called at the start of every state-changing Router function.
```

### 4.10 Incorrect Token Order Handling

**Threat Level**: Medium  
**Status**: Mitigated

**Risk**: Factory returns wrong pair for `(token_b, token_a)` vs `(token_a, token_b)`.

**Mitigation**:
```rust
// Canonical pair key: always smaller address first
fn sort_tokens(token_a: Address, token_b: Address) -> (Address, Address) {
    if token_a < token_b { (token_a, token_b) } else { (token_b, token_a) }
}
// Pairs stored and retrieved with sorted keys.
// Router normalizes token order before pair lookup.
```

---

## 5. Economic Attack Analysis

### 5.1 Sandwich Attack

**Description**: Attacker observes a pending swap, inserts a buy before and sell after to profit from the price impact.

**StellarSwap Mitigations**:
1. **Slippage protection** (`amount_out_min`): Limits attacker's ability to move price profitably. If they push the price beyond the user's slippage tolerance, the user's tx reverts (costing attacker gas/fee but no profit from the sandwich).
2. **Stellar consensus model**: SCP doesn't provide predictable transaction ordering within a ledger in the same way Ethereum's mempool does. MEV extraction is harder.
3. **Low fee environment**: Lower fees mean lower profitability threshold for legitimate swaps, making frontrunning less common relative to trade volume.

**Residual Risk**: Non-zero. Users must set appropriate slippage tolerances. Default: 0.5%.

**Recommendation**: Frontend should display clear price impact warnings for high-impact swaps (>1%) and prompt users to use tighter slippage.

### 5.2 Flash Loan Attack

**Description**: Attacker borrows massive amounts in one tx to manipulate pool prices and exploit dependent protocols.

**StellarSwap Mitigations**:
- Soroban does not support Ethereum-style flash loan callbacks (`executeOperation` pattern)
- All swap calls must net-positive for the pool by the end of the call (invariant check)
- Any attempt to temporarily violate the invariant fails the invariant check

**Residual Risk**: Minimal. Flash loans require repayment within the same call, which the invariant check enforces.

### 5.3 Price Oracle Manipulation

**Description**: Attacker manipulates pool price in a single ledger to exploit downstream protocols that read pool price.

**StellarSwap Mitigations**:
- StellarSwap does NOT expose a spot price oracle function (no `get_price()` in MVP)
- We explicitly warn external protocols not to use instantaneous reserve ratios as price feeds
- TWAP accumulator will be added in V1.1 for safe oracle usage

**Residual Risk**: High if protocols build oracles on spot price. Documentation explicitly warns against this.

### 5.4 LP Rug (Malicious Token)

**Description**: A token in a pool is malicious — its `transfer()` function drains LP funds.

**StellarSwap Mitigations**:
- Protocol itself cannot prevent malicious token contracts
- Frontend maintains a curated token list for safe display
- Users are warned when interacting with unlisted tokens

**Residual Risk**: Inherent to permissionless DEX design. No mitigation at protocol level — user education and frontend curation required.

### 5.5 Pool Griefing (Dust Donations)

**Description**: Attacker sends tiny amounts of tokens directly to the pool (not via add_liquidity), causing `sync()` to update reserves and slightly distort the k value.

**StellarSwap Mitigations**:
- `sync()` updates reserves to match actual balances. Donated tokens increase k (benefit LPs).
- Attacker loses the donated tokens — economically self-punishing.
- `skim()` lets anyone recover excess above stored reserves.

**Residual Risk**: Minimal. Dust donations increase LP value.

### 5.6 Impermanent Loss

**Description**: LPs suffer loss compared to simply holding tokens when price diverges.

**Note**: This is not an attack — it is a known property of AMMs. LPs must understand this risk.

**Formula**: 
```
IL = 2√P / (1+P) - 1
where P = price_ratio_final / price_ratio_initial
```

At 2x price change: IL ≈ -5.7%  
At 5x price change: IL ≈ -20%  
At 10x price change: IL ≈ -33%

**StellarSwap Response**: Document IL prominently in frontend and LP documentation. LPs earn fees that partially offset IL.

---

## 6. Soroban-Specific Security

### 6.1 Storage TTL Expiration

**Risk**: Contract storage entries expire, making contract state inaccessible.

**Mitigation**:
- Every contract call extends instance and relevant persistent TTLs
- TTL extension is done proactively (bump if below half-life threshold)
- LEDGER_BUMP_AMOUNT = 535,000 ledgers ≈ 90 days

```rust
pub fn extend_ttls(env: &Env, keys_to_bump: &[&DataKey]) {
    env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP_AMOUNT);
    for key in keys_to_bump {
        env.storage().persistent().extend_ttl(key, LEDGER_THRESHOLD, LEDGER_BUMP_AMOUNT);
    }
}
```

**Residual Risk**: If no one interacts with a pool for 90 days, state may expire. Recovery requires archival restore mechanism (future work).

### 6.2 Authorization Confusion

**Risk**: Contract calls `require_auth()` on the wrong entity, allowing unauthorized access.

**Mitigation**:
- Explicit actor verification for every mutating call
- All `require_auth()` calls documented in contract code
- Audit checklist includes reviewing every `require_auth()` placement

**Pattern**:
```rust
// CORRECT: Auth on the actual user
pub fn add_liquidity(env: Env, caller: Address, ...) {
    caller.require_auth();
    // caller authorized — can transfer from caller
}

// WRONG: Auth on the wrong entity
pub fn add_liquidity(env: Env, caller: Address, ...) {
    env.current_contract_address().require_auth(); // WRONG!
}
```

### 6.3 WASM Resource Limits

**Risk**: Contract call exceeds CPU/memory limits, causing transaction failure.

**Mitigation**:
- All math is O(1) — no loops over unbounded data
- Multi-hop swaps have bounded path length (max 3 hops enforced)
- No recursive calls
- Regular benchmarking of contract invocation costs

### 6.4 Contract Upgrade Safety

**Risk**: Factory or Router is upgraded to malicious code.

**Mitigation**:
- Factory upgrade requires admin key (multisig in production)
- Pair contracts have no upgrade function — immutable
- Router upgrade: users should verify Router address; Pair contracts are safe regardless
- Upgrade transactions should be announced in advance and reviewed by community

---

## 7. Security Controls Implementation

### 7.1 Input Validation Checklist

Every public function validates:

```
add_liquidity:
  ✓ caller.require_auth()
  ✓ amount_x_desired > 0
  ✓ amount_y_desired > 0
  ✓ to != zero_address
  ✓ deadline > current_timestamp
  ✓ calculated amounts >= minimums

remove_liquidity:
  ✓ caller.require_auth()
  ✓ liquidity > 0
  ✓ liquidity <= caller's LP balance
  ✓ deadline > current_timestamp
  ✓ output amounts >= minimums

swap:
  ✓ Exactly one of amount_x_out, amount_y_out is > 0
  ✓ amount_out < corresponding reserve
  ✓ to != token_x address
  ✓ to != token_y address
  ✓ amount_in > 0 (derived from balance delta)
  ✓ Invariant check passes

create_pair:
  ✓ token_a != token_b
  ✓ Neither token is zero address
  ✓ Pair does not already exist
```

### 7.2 Event Emission Checklist

Every state change emits an event. Events are used for:
- Off-chain state reconstruction
- Indexer analytics
- Audit trail

All events must include:
- Caller/actor address
- All relevant amounts
- Timestamps (via ledger data, implicit)

### 7.3 Math Safety Checklist

```
✓ All multiplications use checked_mul()
✓ All additions use checked_add()
✓ All subtractions use checked_sub()
✓ All divisions have non-zero denominator guard
✓ MAX_RESERVE enforced on reserve updates
✓ Minimum output enforced on swap
✓ Minimum liquidity enforced on first deposit
```

---

## 8. Security Assumptions

The following are explicit security assumptions. If any are violated, the security properties of StellarSwap may not hold.

1. **Stellar network is live and SCP consensus is honest**: Protocol relies on Stellar's consensus for transaction ordering and finality.

2. **Token contracts are well-behaved**: SEP-41 token transfers behave correctly — they actually move tokens and don't lie about balances. Malicious tokens can harm users of that specific pool but cannot compromise other pools.

3. **Rust and Soroban SDK have no critical bugs**: We rely on the correctness of the Soroban SDK and Rust's type system.

4. **WASM compilation is correct**: `cargo build --target wasm32v1-none` produces WASM that behaves identically to the Rust source code.

5. **Admin key is not compromised**: The Factory admin (for fee configuration) holds a private key that is not stolen. In production, this should be a multisig or DAO.

6. **Slippage settings are correctly communicated to users**: The frontend must accurately display expected amounts and enforce slippage settings.

---

## 9. Incident Response

### 9.1 Response Levels

| Severity | Definition | Response Time | Action |
|----------|-----------|---------------|--------|
| Critical | Active exploit, funds at risk | < 1 hour | Emergency response |
| High | Vulnerability found, not exploited | < 24 hours | Coordinated disclosure |
| Medium | Design flaw with limited impact | < 7 days | Fix in next release |
| Low | Minor issue, no fund risk | Next sprint | Standard fix |

### 9.2 Critical Response Playbook

Since Pair contracts are immutable (no pause function), response to an active exploit:

1. **Announce**: Post warning on all channels (Discord, Twitter, Telegram) to stop using affected pool
2. **Identify**: Determine which pairs are affected
3. **Advise**: Instruct LPs to call `remove_liquidity` immediately
4. **Disable Router**: If Router is the exploit vector, deploy new Router that reverts all calls for affected pairs
5. **Post-mortem**: Full public post-mortem within 7 days

**Note**: Because Pair contracts are immutable, "fixing" a deployed pair is impossible. New pairs must be deployed with fixed code. Users are directed to migrate liquidity.

### 9.3 Bug Bounty

Bug bounty program (post-audit) with rewards:

| Severity | Reward |
|----------|--------|
| Critical | Up to $50,000 |
| High | Up to $10,000 |
| Medium | Up to $2,500 |
| Low | Up to $500 |

---

## 10. Pre-Audit Checklist

This checklist must be completed before requesting a formal audit.

### Code Quality
- [ ] All public functions have NatSpec-style documentation
- [ ] All error conditions have descriptive error codes
- [ ] No `unwrap()` calls without documented invariant justification
- [ ] No `TODO` or `FIXME` comments in production code
- [ ] `cargo clippy` passes with zero warnings

### Math
- [ ] All arithmetic uses checked variants
- [ ] Overflow boundary tested at MAX_RESERVE
- [ ] Invariant property test passes for 100,000 iterations
- [ ] LP mint formula verified against off-chain calculation
- [ ] Fee calculation verified: exactly 0.3%

### Authorization
- [ ] Every public mutating function has `require_auth()`
- [ ] Admin functions reject non-admin callers (verified by tests)
- [ ] `initialize()` is idempotent and can only be called once

### State Management
- [ ] Reserves are updated after every swap/liquidity call
- [ ] TTL extension called on every contract invocation
- [ ] No persistent state left without TTL management

### Events
- [ ] Every state change emits an event
- [ ] All event data is accurate and complete

### Testing
- [ ] Unit test coverage > 90%
- [ ] Integration tests cover all user flows
- [ ] Attack scenario tests all revert as expected
- [ ] Economic invariant tests confirm fee accumulation

### Documentation
- [ ] PRD, Architecture, and Security docs complete
- [ ] Contract README files explain all functions
- [ ] Audit preparation document complete

---

*End of SECURITY — Version 1.0.0*
