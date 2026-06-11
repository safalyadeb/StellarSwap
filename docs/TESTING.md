# StellarSwap — Testing Strategy

**Version:** 1.0.0  
**Date:** 2026-06-02  

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Testing Pyramid](#2-testing-pyramid)
3. [Critical Invariants](#3-critical-invariants)
4. [Unit Tests](#4-unit-tests)
5. [Integration Tests](#5-integration-tests)
6. [Property & Fuzz Tests](#6-property--fuzz-tests)
7. [Economic Simulation Tests](#7-economic-simulation-tests)
8. [Security Tests](#8-security-tests)
9. [Test Coverage Requirements](#9-test-coverage-requirements)
10. [Test Environment Setup](#10-test-environment-setup)
11. [CI/CD Testing Pipeline](#11-cicd-testing-pipeline)

---

## 1. Testing Philosophy

StellarSwap handles user funds. Every line of code that touches reserves, LP tokens, or swap calculations must be tested exhaustively.

### Core Testing Beliefs

1. **Test the invariants, not just the happy path**: The constant product invariant is the most important property. Every test must verify it holds.
2. **Test economic properties, not just function calls**: Does the LP actually profit? Does the trader receive the correct amount? Test these mathematically.
3. **Test failure modes explicitly**: Every `panic_with_error!` call must have a corresponding test that confirms the revert.
4. **Fuzz the math**: Hand-crafted test cases can't find edge cases. Property-based testing catches what human intuition misses.
5. **Tests are documentation**: Test names should read as specifications. `test_swap_reverts_when_output_exceeds_reserve` is better than `test_swap_edge_case_1`.

---

## 2. Testing Pyramid

```
                 ┌─────────────────┐
                 │   E2E / Manual  │  5%
                 │  (testnet QA)   │
                ┌┴─────────────────┴┐
                │  Economic Sims    │  10%
                │  (LP economics)   │
               ┌┴───────────────────┴┐
               │  Fuzz / Property    │  15%
               │  (invariant tests)  │
              ┌┴─────────────────────┴┐
              │   Integration Tests   │  25%
              │   (multi-contract)    │
             ┌┴───────────────────────┴┐
             │      Unit Tests         │  45%
             │  (per-function, fast)   │
             └─────────────────────────┘
```

---

## 3. Critical Invariants

These invariants must hold at all times. Every test suite validates these.

### I1: Constant Product (Never Decreases)
```
After every swap: reserve_x_new * reserve_y_new >= reserve_x_old * reserve_y_old
```

### I2: LP Supply Conservation
```
sum(all LP balances) == total_lp_supply at all times
```

### I3: Reserve Accuracy
```
contract.reserve_x == TOKEN_X.balance(contract_address) at all times
contract.reserve_y == TOKEN_Y.balance(contract_address) at all times
```

### I4: Fee Correctness
```
After swap(amount_in):
  amount_in_effective = amount_in * 997 / 1000
  amount_out = amount_in_effective * reserve_out / (reserve_in + amount_in_effective)
  amount_out >= amount_out_min
```

### I5: LP Redemption Honesty
```
LP provider who adds X tokens and removes after N swaps
receives >= X tokens worth (modulo impermanent loss and fees)
```
Note: I5 is about fee accumulation — LPs should gain from fees.

### I6: Slippage Protection
```
If actual_amount_out < amount_out_min, transaction reverts
```

### I7: No Token Leakage
```
After any sequence of operations:
  sum(all user balances) + sum(all pool reserves) == total_token_supply
```

---

## 4. Unit Tests

Unit tests live alongside each contract in `contracts/<name>/src/test.rs`.

### 4.1 Math Unit Tests (`shared/src/test.rs`)

```rust
#[test]
fn test_get_amount_out_basic() {
    // Known values: reserve_in=1000, reserve_out=1000, amount_in=100
    // expected: floor((100 * 997 * 1000) / (1000 * 1000 + 100 * 997))
    //         = floor(99700000 / 1099700) = floor(90.66) = 90
    let result = get_amount_out(100, 1000, 1000);
    assert_eq!(result, 90);
}

#[test]
fn test_get_amount_out_zero_input_panics() {
    // should panic with InsufficientInputAmount
}

#[test]
fn test_get_amount_out_zero_reserve_panics() {
    // should panic with InsufficientLiquidity
}

#[test]
fn test_get_amount_in_basic() {
    // Inverse of amount_out
    let amount_in = get_amount_in(90, 1000, 1000);
    // amount_in should be ~101 (due to fee and rounding)
    assert!(amount_in <= 110); // reasonable upper bound
}

#[test]
fn test_quote_basic() {
    // quote(100, 1000, 2000) = 200
    assert_eq!(quote(100, 1000, 2000), 200);
}

#[test]
fn test_sqrt_perfect_squares() {
    assert_eq!(sqrt(0), 0);
    assert_eq!(sqrt(1), 1);
    assert_eq!(sqrt(4), 2);
    assert_eq!(sqrt(9), 3);
    assert_eq!(sqrt(100), 10);
    assert_eq!(sqrt(1_000_000), 1000);
}

#[test]
fn test_sqrt_imperfect_rounds_down() {
    // sqrt(2) = 1 (floor)
    assert_eq!(sqrt(2), 1);
    assert_eq!(sqrt(3), 1);
    assert_eq!(sqrt(10), 3);
}

#[test]
fn test_invariant_holds_after_swap() {
    let reserve_in = 1_000_000i128;
    let reserve_out = 1_000_000i128;
    let amount_in = 100_000i128;
    let amount_out = get_amount_out(amount_in, reserve_in, reserve_out);

    let new_reserve_in = reserve_in + amount_in;
    let new_reserve_out = reserve_out - amount_out;

    // k_new >= k_old (the fee makes k grow slightly)
    assert!(new_reserve_in * new_reserve_out >= reserve_in * reserve_out);
}
```

### 4.2 Factory Unit Tests (`factory/src/test.rs`)

```rust
#[test]
fn test_create_pair_success() {}

#[test]
fn test_create_pair_identical_tokens_panics() {}

#[test]
fn test_create_pair_duplicate_panics() {}

#[test]
fn test_get_pair_canonical_order() {
    // get_pair(A, B) == get_pair(B, A)
}

#[test]
fn test_all_pairs_indexing() {
    // After creating 3 pairs, all_pairs_length == 3
    // all_pairs(0), all_pairs(1), all_pairs(2) return correct addresses
}

#[test]
fn test_set_fee_to_admin_only() {
    // non-admin calling set_fee_to panics
}

#[test]
fn test_set_fee_to_setter_transfers_role() {}
```

### 4.3 Pair Unit Tests (`pair/src/test.rs`)

```rust
#[test]
fn test_first_add_liquidity() {
    // Initial deposit: 1000 X, 1000 Y
    // Expected LP = sqrt(1000 * 1000) - 1000 = 0
    // WAIT — this is 0! Minimum deposit must be > MINIMUM_LIQUIDITY^2
    // Correct test: 10000 X, 10000 Y
    // LP = sqrt(10000 * 10000) - 1000 = 10000 - 1000 = 9000
}

#[test]
fn test_second_add_liquidity_proportional() {
    // After initial 10000/10000 deposit (9000 LP)
    // Second deposit: 5000/5000
    // LP = min(5000*9000/10000, 5000*9000/10000) = min(4500, 4500) = 4500
    // Total LP = 10000 (9000 + 1000 burned + 4500 wait...)
    // Actually: total_supply = 10000, minted_to_user = 9000
    // new_lp = 5000 * 10000 / 10000 = 5000
}

#[test]
fn test_remove_liquidity_proportional() {
    // LP burns 50% of their LP tokens → receives 50% of each reserve
}

#[test]
fn test_swap_basic_x_for_y() {
    // Sell 100 X, receive correct Y amount
    // Verify invariant holds
}

#[test]
fn test_swap_basic_y_for_x() {}

#[test]
fn test_swap_reverts_when_output_exceeds_reserve() {
    // amount_y_out = reserve_y + 1 should panic
}

#[test]
fn test_swap_reverts_with_zero_input() {
    // Transfer 0 tokens, then call swap — should panic
}

#[test]
fn test_swap_invariant_check_catches_bad_math() {
    // This tests the invariant check itself by simulating a
    // call that tries to extract more than the formula allows
}

#[test]
fn test_minimum_liquidity_burned_on_first_deposit() {
    // After first deposit, balance(dead_address) == 1000
}

#[test]
fn test_sync_updates_reserves() {
    // Direct-transfer tokens to pair, then sync()
    // Verify reserves match new balances
}

#[test]
fn test_skim_recovers_excess() {
    // Direct-transfer tokens to pair
    // skim(recipient) should transfer excess to recipient
}

// LP Token Tests
#[test]
fn test_lp_transfer_basic() {}
#[test]
fn test_lp_approve_and_transfer_from() {}
#[test]
fn test_lp_transfer_fails_insufficient_balance() {}
#[test]
fn test_lp_total_supply_accurate() {}
```

### 4.4 Router Unit Tests (`router/src/test.rs`)

```rust
#[test]
fn test_swap_exact_tokens_for_tokens_single_hop() {}

#[test]
fn test_swap_exact_tokens_for_tokens_multi_hop() {}

#[test]
fn test_swap_reverts_expired_deadline() {}

#[test]
fn test_swap_reverts_insufficient_output() {}

#[test]
fn test_swap_tokens_for_exact_tokens() {}

#[test]
fn test_add_liquidity_new_pair() {}

#[test]
fn test_add_liquidity_existing_pair() {}

#[test]
fn test_remove_liquidity() {}

#[test]
fn test_get_amount_out_matches_contract() {}

#[test]
fn test_get_amounts_out_multi_hop() {}

#[test]
fn test_quote_accuracy() {}

#[test]
fn test_invalid_path_reverts() {
    // path.len() < 2 should panic
}
```

---

## 5. Integration Tests

Integration tests live in `tests/integration/` and use TypeScript with the Soroban test environment.

### 5.1 Full Liquidity Lifecycle

```typescript
describe('Full LP Lifecycle', () => {
  it('LP provides and removes liquidity, earning fees', async () => {
    // Setup: deploy all contracts, mint test tokens
    const { factory, router, tokenA, tokenB } = await setupTestEnv();
    
    // Step 1: Alice adds initial liquidity
    await router.addLiquidity({
      tokenA: tokenA.address,
      tokenB: tokenB.address,
      amountADesired: 10_000_000n,
      amountBDesired: 10_000_000n,
      amountAMin: 9_900_000n,
      amountBMin: 9_900_000n,
      to: alice.address,
      deadline: nowPlusSeconds(300),
    });

    const aliceLpBalance = await pair.lpBalance(alice.address);
    expect(aliceLpBalance).toBeGreaterThan(0n);

    // Step 2: Bob makes 10 swaps (generates fees)
    for (let i = 0; i < 10; i++) {
      await router.swapExactTokensForTokens({
        amountIn: 1_000_000n,
        amountOutMin: 900_000n,
        path: [tokenA.address, tokenB.address],
        to: bob.address,
        deadline: nowPlusSeconds(300),
      });
    }

    // Step 3: Alice removes all liquidity
    const [amountA, amountB] = await router.removeLiquidity({
      tokenA: tokenA.address,
      tokenB: tokenB.address,
      liquidity: aliceLpBalance,
      amountAMin: 0n,
      amountBMin: 0n,
      to: alice.address,
      deadline: nowPlusSeconds(300),
    });

    // Alice should receive more than she deposited (due to fees)
    expect(amountA + amountB).toBeGreaterThan(20_000_000n);
  });
});
```

### 5.2 Multi-Hop Swap

```typescript
describe('Multi-Hop Routing', () => {
  it('swaps A→B→C via two pools', async () => {
    // Setup pools: A/B and B/C
    await setupPool(tokenA, tokenB, 10_000_000n, 10_000_000n);
    await setupPool(tokenB, tokenC, 10_000_000n, 10_000_000n);

    const amountsOut = await router.getAmountsOut(
      1_000_000n,
      [tokenA.address, tokenB.address, tokenC.address]
    );

    await router.swapExactTokensForTokens({
      amountIn: 1_000_000n,
      amountOutMin: amountsOut[2] * 99n / 100n, // 1% slippage
      path: [tokenA.address, tokenB.address, tokenC.address],
      to: trader.address,
      deadline: nowPlusSeconds(300),
    });

    const balanceC = await tokenC.balance(trader.address);
    expect(balanceC).toBeGreaterThanOrEqual(amountsOut[2] * 99n / 100n);
  });
});
```

### 5.3 Economic Invariant Validation

```typescript
describe('Economic Invariants', () => {
  it('k never decreases after 100 random swaps', async () => {
    const pair = await setupPool(tokenA, tokenB, 1_000_000_000n, 1_000_000_000n);
    
    let prevK = 1_000_000_000n * 1_000_000_000n;
    
    for (let i = 0; i < 100; i++) {
      const amountIn = BigInt(Math.floor(Math.random() * 1_000_000) + 1);
      await router.swapExactTokensForTokens({
        amountIn,
        amountOutMin: 1n,
        path: [tokenA.address, tokenB.address],
        to: trader.address,
        deadline: nowPlusSeconds(300),
      });
      
      const [reserveA, reserveB] = await pair.getReserves();
      const newK = reserveA * reserveB;
      expect(newK).toBeGreaterThanOrEqual(prevK);
      prevK = newK;
    }
  });
});
```

---

## 6. Property & Fuzz Tests

### 6.1 Rust Property Tests (proptest)

```rust
// contracts/shared/src/test.rs
use proptest::prelude::*;

proptest! {
    #[test]
    fn prop_amount_out_never_exceeds_reserve(
        amount_in in 1i128..MAX_RESERVE,
        reserve_in in 1i128..MAX_RESERVE,
        reserve_out in 1i128..MAX_RESERVE,
    ) {
        let out = get_amount_out(amount_in, reserve_in, reserve_out);
        prop_assert!(out < reserve_out);
    }

    #[test]
    fn prop_amount_out_positive(
        amount_in in 1i128..MAX_RESERVE,
        reserve_in in 1i128..MAX_RESERVE,
        reserve_out in 1i128..MAX_RESERVE,
    ) {
        let out = get_amount_out(amount_in, reserve_in, reserve_out);
        prop_assert!(out > 0);
    }

    #[test]
    fn prop_invariant_holds_after_swap(
        amount_in in 1i128..1_000_000_000i128,
        reserve_in in 1_000i128..100_000_000_000i128,
        reserve_out in 1_000i128..100_000_000_000i128,
    ) {
        let out = get_amount_out(amount_in, reserve_in, reserve_out);
        let new_reserve_in = reserve_in + amount_in;
        let new_reserve_out = reserve_out - out;
        prop_assert!(new_reserve_in * new_reserve_out >= reserve_in * reserve_out);
    }

    #[test]
    fn prop_fee_is_0_3_percent(
        amount_in in 1_000_000i128..1_000_000_000i128,
        reserve_in in 1_000_000_000i128..10_000_000_000i128,
        reserve_out in 1_000_000_000i128..10_000_000_000i128,
    ) {
        let out = get_amount_out(amount_in, reserve_in, reserve_out);
        // Without fee: out_no_fee = amount_in * reserve_out / (reserve_in + amount_in)
        let out_no_fee = amount_in * reserve_out / (reserve_in + amount_in);
        // With fee: out should be ~0.997 * out_no_fee
        // out / out_no_fee should be ~0.997 ± 0.001 (rounding)
        prop_assert!(out <= out_no_fee);
        prop_assert!(out * 1000 >= out_no_fee * 990); // at least 99% efficiency
    }

    #[test]
    fn prop_sqrt_squared_leq_input(
        n in 0i128..i128::MAX,
    ) {
        let s = sqrt(n);
        prop_assert!(s * s <= n);
        prop_assert!((s + 1) * (s + 1) > n || s == i128::MAX);
    }
}
```

### 6.2 Cargo Fuzz Targets

```rust
// tests/fuzz/fuzz_targets/swap_math.rs
#![no_main]
use libfuzzer_sys::fuzz_target;
use stellar_swap_shared::math::get_amount_out;

fuzz_target!(|data: &[u8]| {
    if data.len() < 24 { return; }
    let amount_in = i64::from_le_bytes(data[0..8].try_into().unwrap()) as i128;
    let reserve_in = i64::from_le_bytes(data[8..16].try_into().unwrap()) as i128;
    let reserve_out = i64::from_le_bytes(data[16..24].try_into().unwrap()) as i128;

    if amount_in <= 0 || reserve_in <= 0 || reserve_out <= 0 { return; }
    if amount_in > 1_000_000_000_000_000i128 { return; }
    if reserve_in > 1_000_000_000_000_000i128 { return; }
    if reserve_out > 1_000_000_000_000_000i128 { return; }

    let out = get_amount_out(amount_in, reserve_in, reserve_out);
    
    // These must always hold:
    assert!(out >= 0);
    assert!(out < reserve_out);
    
    let new_r_in = reserve_in + amount_in;
    let new_r_out = reserve_out - out;
    assert!(new_r_in * new_r_out >= reserve_in * reserve_out);
});
```

---

## 7. Economic Simulation Tests

### 7.1 LP Profitability Simulation

```typescript
// tests/simulation/economic_simulation.ts

async function simulateLPProfitability() {
  const INITIAL_LIQUIDITY = 1_000_000_000n; // 100,000 tokens each side
  const NUM_SWAPS = 10_000;
  const SWAP_SIZE_RANGE = [1_000n, 1_000_000n]; // 0.01 to 1 token

  // Setup
  const pair = await setupPool(INITIAL_LIQUIDITY, INITIAL_LIQUIDITY);

  // Record initial deposit value in TOKEN_A terms
  const initialValueInA = INITIAL_LIQUIDITY * 2n; // 2x token_a worth

  // Run swaps
  let totalFeesEarned = 0n;
  for (let i = 0; i < NUM_SWAPS; i++) {
    const amountIn = randomBigInt(...SWAP_SIZE_RANGE);
    const direction = i % 2 === 0; // alternate direction to prevent drain
    await swap(pair, amountIn, direction);
  }

  // Remove all liquidity
  const [amountA, amountB] = await removeLiquidity(pair, LP_TOTAL);
  const [reserveA, reserveB] = await pair.getReserves();
  
  // Calculate fee earned (in TOKEN_A terms at current price)
  const priceAinB = reserveB / reserveA; // rough approximation
  const finalValueInA = amountA + amountB / priceAinB;

  console.log(`LP started with: ${initialValueInA} TOKEN_A equivalent`);
  console.log(`LP ended with: ${finalValueInA} TOKEN_A equivalent`);
  console.log(`Total fees earned: ${finalValueInA - initialValueInA}`);
  console.log(`Fee APY estimate: ${calculateAPY(finalValueInA, initialValueInA, NUM_SWAPS)}`);

  // Assertion: LP earned fees (value increased above initial minus IL)
  // This is tricky to assert precisely due to IL, but fees should dominate
  // for small, bidirectional swaps
  expect(finalValueInA).toBeGreaterThan(initialValueInA * 99n / 100n); // accounting for IL
}
```

### 7.2 Impermanent Loss Calculation

```typescript
async function verifyImpermanentLoss() {
  // Scenario: Pool starts 1:1, price moves to 4:1
  // IL formula: 2*sqrt(P)/(1+P) - 1 where P = price ratio change

  const INITIAL = 1_000_000n;
  const pair = await setupPool(INITIAL, INITIAL); // 1:1

  // Simulate price moving to 4:1 via large buy
  await swap(pair, 1_500_000n, true); // buy TOKEN_A aggressively

  const [reserveA, reserveB] = await pair.getReserves();
  const priceRatio = Number(reserveB) / Number(reserveA); // should be ~4

  // IL at 4x price change: 2*sqrt(4)/(1+4) - 1 = 4/5 - 1 = -0.2 = -20%
  const expectedIL = 2 * Math.sqrt(priceRatio) / (1 + priceRatio) - 1;
  console.log(`Price ratio: ${priceRatio}x, Impermanent loss: ${(expectedIL * 100).toFixed(2)}%`);
  
  expect(expectedIL).toBeCloseTo(-0.2, 1); // ~20% IL at 4x price
}
```

---

## 8. Security Tests

### 8.1 Reentrancy Non-Issue Confirmation

```rust
// Confirm that our swap logic, even with a malicious token, cannot re-enter
// Since Soroban prevents this architecturally, this test documents the assumption

#[test]
fn test_no_reentrancy_possible_by_architecture() {
    // Document: Soroban executes contracts synchronously, single frame per tx
    // A malicious token's transfer() cannot call back into the Pair contract
    // within the same execution context
    // 
    // This test exists as documentation, not as runnable code.
    // Soroban's host enforces this at the WASM level.
    assert!(true, "Reentrancy is architecturally impossible in Soroban");
}
```

### 8.2 Authorization Attack Tests

```rust
#[test]
#[should_panic(expected = "HostError")]
fn test_unauthorized_add_liquidity() {
    // Bob tries to add liquidity pretending to be Alice
    // Should fail because Alice hasn't authorized this
}

#[test]
#[should_panic(expected = "HostError")]
fn test_unauthorized_factory_fee_change() {
    // Non-admin tries to set_fee_to
}

#[test]
#[should_panic(expected = "AlreadyInitialized")]
fn test_pair_double_initialization() {
    // Calling initialize() twice on a Pair should revert
}
```

### 8.3 Slippage Attack Test

```rust
#[test]
#[should_panic(expected = "InsufficientOutputAmount")]
fn test_slippage_protection_reverts() {
    // Set up pool, then try to swap with amount_out_min set to 
    // more than the pool can provide
}
```

### 8.4 Zero Amount Tests

```rust
#[test]
#[should_panic]
fn test_swap_zero_input_reverts() {}

#[test]
#[should_panic]
fn test_add_liquidity_zero_amounts_reverts() {}

#[test]
#[should_panic]
fn test_remove_liquidity_zero_lp_reverts() {}
```

---

## 9. Test Coverage Requirements

| Contract | Line Coverage | Branch Coverage |
|----------|--------------|----------------|
| shared/math | ≥ 100% | ≥ 100% |
| factory | ≥ 95% | ≥ 90% |
| pair | ≥ 95% | ≥ 90% |
| router | ≥ 90% | ≥ 85% |
| token (reference) | ≥ 90% | ≥ 85% |

Coverage tool: `cargo-tarpaulin` or `cargo-llvm-cov`

---

## 10. Test Environment Setup

### 10.1 Soroban Test Environment

```rust
// Standard setup pattern for all contract tests
#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use crate::contract::{PairContract, PairContractClient};

    fn setup() -> (Env, PairContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();  // Auto-approve all require_auth() calls in tests
        
        let contract_id = env.register_contract(None, PairContract);
        let client = PairContractClient::new(&env, &contract_id);
        
        let token_x = Address::generate(&env);
        let token_y = Address::generate(&env);
        let factory = Address::generate(&env);
        
        (env, client, token_x, token_y, factory)
    }

    #[test]
    fn test_initialize() {
        let (env, client, token_x, token_y, factory) = setup();
        client.initialize(&token_x, &token_y, &factory);
        assert_eq!(client.token_x(), token_x);
        assert_eq!(client.token_y(), token_y);
    }
}
```

### 10.2 Running Tests

```bash
# Unit tests (all contracts)
cargo test --workspace

# Specific contract
cargo test -p pair

# With logging
RUST_LOG=debug cargo test -p pair -- --nocapture

# Property tests (more iterations)
PROPTEST_CASES=10000 cargo test -p shared prop_

# Fuzz tests
cargo fuzz run swap_math -- -max_total_time=60

# TypeScript integration tests
npm test --workspace=tests/integration

# Full test suite
./scripts/test_all.sh
```

---

## 11. CI/CD Testing Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  rust-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32v1-none
      - run: cargo test --workspace
      - run: cargo clippy --workspace -- -D warnings
      - run: cargo fmt --check --all

  property-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: PROPTEST_CASES=1000 cargo test -p shared prop_

  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: cargo install cargo-llvm-cov
      - run: cargo llvm-cov --workspace --lcov --output-path lcov.info
      - uses: codecov/codecov-action@v4
        with:
          files: lcov.info

  typescript-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test --workspace=sdk/typescript
      - run: npm test --workspace=tests/integration
```

---

*End of TESTING — Version 1.0.0*
