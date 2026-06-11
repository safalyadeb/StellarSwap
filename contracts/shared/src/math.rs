//! Core AMM math — mirrors Uniswap V2 formulas exactly, adapted for i128.
//!
//! Fee: 0.3% retained by pool (997/1000 of input is effective).
//! All divisions are the final operation to minimise precision loss.
//! All arithmetic uses checked variants; overflow panics the transaction.

use soroban_sdk::Env;

use crate::errors::StellarSwapError;

/// Maximum allowable reserve per pool side (10^18 stroops = 100B tokens).
/// Keeps (balance × 1000)² within i128 range (1.7 × 10^38).
pub const MAX_RESERVE: i128 = 1_000_000_000_000_000_000i128;

/// LP units permanently burned on the very first deposit.
pub const MINIMUM_LIQUIDITY: i128 = 1_000;

// ── Core formulas ─────────────────────────────────────────────────────────────

/// Given an exact input amount, compute the maximum output.
///
/// Formula: `amount_out = (amount_in * 997 * reserve_out)
///                        / (reserve_in * 1000 + amount_in * 997)`
pub fn get_amount_out(env: &Env, amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128 {
    if amount_in <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientInputAmount);
    }
    if reserve_in <= 0 || reserve_out <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientLiquidity);
    }

    let amount_in_with_fee = checked_mul(env, amount_in, 997);
    let numerator = checked_mul(env, amount_in_with_fee, reserve_out);
    let denominator = checked_add(env, checked_mul(env, reserve_in, 1000), amount_in_with_fee);
    numerator / denominator
}

/// Given an exact output, compute the minimum required input.
///
/// Formula: `amount_in = ceil((reserve_in * amount_out * 1000)
///                            / ((reserve_out - amount_out) * 997))`
pub fn get_amount_in(env: &Env, amount_out: i128, reserve_in: i128, reserve_out: i128) -> i128 {
    if amount_out <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientOutputAmount);
    }
    if reserve_in <= 0 || reserve_out <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientLiquidity);
    }
    if amount_out >= reserve_out {
        env.panic_with_error(StellarSwapError::InsufficientReserve);
    }

    let numerator = checked_mul(env, checked_mul(env, reserve_in, amount_out), 1000);
    let denominator = checked_mul(env, reserve_out - amount_out, 997);
    (numerator / denominator) + 1
}

/// Proportional quote — no fee, no price impact. Used for deposit ratio math.
///
/// Formula: `amount_b = amount_a * reserve_b / reserve_a`
pub fn quote(env: &Env, amount_a: i128, reserve_a: i128, reserve_b: i128) -> i128 {
    if amount_a <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientInputAmount);
    }
    if reserve_a <= 0 || reserve_b <= 0 {
        env.panic_with_error(StellarSwapError::InsufficientLiquidity);
    }
    checked_mul(env, amount_a, reserve_b) / reserve_a
}

/// Integer square root (floor) — Newton/Babylonian method.
/// Used only for first LP deposit: `lp = sqrt(amount_x * amount_y)`.
pub fn sqrt(y: i128) -> i128 {
    if y < 0 {
        panic!("sqrt of negative");
    }
    if y == 0 {
        return 0;
    }
    if y < 4 {
        return 1;
    }

    let mut z = y;
    let mut x = y / 2 + 1;
    while x < z {
        z = x;
        x = (y / x + x) / 2;
    }
    z
}

// ── Checked arithmetic ────────────────────────────────────────────────────────

#[inline(always)]
pub fn checked_mul(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_mul(b) {
        Some(v) => v,
        None => {
            env.panic_with_error(StellarSwapError::Overflow);
        }
    }
}

#[inline(always)]
pub fn checked_add(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_add(b) {
        Some(v) => v,
        None => {
            env.panic_with_error(StellarSwapError::Overflow);
        }
    }
}

#[inline(always)]
pub fn checked_sub(env: &Env, a: i128, b: i128) -> i128 {
    match a.checked_sub(b) {
        Some(v) => v,
        None => {
            env.panic_with_error(StellarSwapError::Overflow);
        }
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::Env;

    fn env() -> Env {
        Env::default()
    }

    #[test]
    fn test_amount_out_symmetric_pool() {
        // reserve_in=1000, reserve_out=1000, amount_in=100
        // numerator   = 100*997*1000 = 99_700_000
        // denominator = 1000*1000 + 100*997 = 1_099_700
        // result      = 90 (floor)
        assert_eq!(get_amount_out(&env(), 100, 1000, 1000), 90);
    }

    #[test]
    fn test_amount_out_invariant_holds() {
        let e = env();
        let (r_in, r_out, amount_in) = (1_000_000i128, 1_000_000i128, 100_000i128);
        let out = get_amount_out(&e, amount_in, r_in, r_out);
        assert!((r_in + amount_in) * (r_out - out) >= r_in * r_out);
    }

    #[test]
    #[should_panic]
    fn test_amount_out_zero_input_panics() {
        get_amount_out(&env(), 0, 1000, 1000);
    }

    #[test]
    #[should_panic]
    fn test_amount_out_zero_reserve_panics() {
        get_amount_out(&env(), 100, 0, 1000);
    }

    #[test]
    fn test_amount_in_round_trip() {
        let e = env();
        let (r_in, r_out) = (1_000_000i128, 1_000_000i128);
        let desired_out = 90_000i128;
        let needed = get_amount_in(&e, desired_out, r_in, r_out);
        let actual_out = get_amount_out(&e, needed, r_in, r_out);
        assert!(actual_out >= desired_out);
    }

    #[test]
    #[should_panic]
    fn test_amount_in_exceeds_reserve_panics() {
        get_amount_in(&env(), 1001, 1000, 1000);
    }

    #[test]
    fn test_quote_proportional() {
        assert_eq!(quote(&env(), 100, 1000, 2000), 200);
    }

    #[test]
    fn test_quote_identity() {
        assert_eq!(quote(&env(), 500, 1000, 1000), 500);
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
    fn test_sqrt_rounds_down() {
        assert_eq!(sqrt(2), 1);
        assert_eq!(sqrt(8), 2);
        assert_eq!(sqrt(10), 3);
    }

    #[test]
    fn test_sqrt_invariant() {
        for &n in &[0i128, 1, 4, 99, 100, 101, 999_999, 1_000_000] {
            let s = sqrt(n);
            assert!(s * s <= n, "sqrt({n}) = {s}, {s}^2 > {n}");
            if s < i128::MAX - 1 {
                assert!((s + 1) * (s + 1) > n);
            }
        }
    }

    #[test]
    fn test_fee_is_approx_0_3_percent() {
        let e = env();
        let (r_in, r_out) = (1_000_000_000i128, 1_000_000_000i128);
        let amount_in = 10_000_000i128;
        let out_with_fee = get_amount_out(&e, amount_in, r_in, r_out);
        let out_no_fee = amount_in * r_out / (r_in + amount_in);
        // ratio should be ~997/1000 ≈ 99.7%
        let ratio_bps = out_with_fee * 10_000 / out_no_fee;
        assert!(
            ratio_bps >= 9960 && ratio_bps <= 9980,
            "ratio {ratio_bps} bps outside 9960–9980 range"
        );
    }
}
