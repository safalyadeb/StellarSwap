//! LP token accounting embedded in the Pair contract.
//!
//! LP tokens are SEP-41 compatible — they support transfer, approve, transferFrom.
//! By embedding LP logic here instead of a separate contract, we eliminate a
//! cross-contract call on every liquidity operation.

use soroban_sdk::{panic_with_error, Address, Env};

use stellar_swap_shared::errors::StellarSwapError;

use crate::storage;

/// Mint `amount` LP tokens to `to`.
pub fn mint(env: &Env, to: &Address, amount: i128) {
    let bal = storage::get_lp_balance(env, to);
    storage::set_lp_balance(env, to, bal + amount);
    let supply = storage::get_total_supply(env);
    storage::set_total_supply(env, supply + amount);
}

/// Permanently lock `amount` LP tokens (inflate total_supply without any recipient).
/// Used for MINIMUM_LIQUIDITY on first deposit — these tokens can never be redeemed.
pub fn lock_forever(env: &Env, amount: i128) {
    let supply = storage::get_total_supply(env);
    storage::set_total_supply(env, supply + amount);
}

/// Burn `amount` LP tokens from `from`.
/// Panics if balance is insufficient.
pub fn burn(env: &Env, from: &Address, amount: i128) {
    let bal = storage::get_lp_balance(env, from);
    if bal < amount {
        env.panic_with_error(StellarSwapError::InsufficientBalance);
    }
    storage::set_lp_balance(env, from, bal - amount);

    let supply = storage::get_total_supply(env);
    storage::set_total_supply(env, supply - amount);
}

/// Transfer `amount` LP tokens from `from` to `to`.
pub fn transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
    let from_bal = storage::get_lp_balance(env, from);
    if from_bal < amount {
        env.panic_with_error(StellarSwapError::InsufficientBalance);
    }
    storage::set_lp_balance(env, from, from_bal - amount);

    let to_bal = storage::get_lp_balance(env, to);
    storage::set_lp_balance(env, to, to_bal + amount);
}

/// Transfer `amount` LP tokens on behalf of `from` by an approved `spender`.
pub fn transfer_from(env: &Env, spender: &Address, from: &Address, to: &Address, amount: i128) {
    let (allowed, exp) = storage::get_lp_allowance(env, from, spender);

    if exp < env.ledger().sequence() {
        env.panic_with_error(StellarSwapError::AllowanceExpired);
    }
    if allowed < amount {
        env.panic_with_error(StellarSwapError::InsufficientAllowance);
    }

    storage::set_lp_allowance(env, from, spender, allowed - amount, exp);
    transfer(env, from, to, amount);
}

/// Set allowance for `spender` to spend `from`'s LP tokens.
pub fn approve(env: &Env, from: &Address, spender: &Address, amount: i128, expiration_ledger: u32) {
    storage::set_lp_allowance(env, from, spender, amount, expiration_ledger);
}
