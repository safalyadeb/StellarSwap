//! Cross-contract interface traits.
//!
//! Using `#[contractclient]` on a trait generates a typed client struct
//! (`TokenClient`, `PairClient`, `FactoryClient`) that any contract can use
//! for cross-contract calls — without requiring the target WASM at compile time.
//!
//! This is the correct production pattern for Soroban cross-contract calls.
//! `contractimport!` is reserved for test environments only.

use soroban_sdk::{contractclient, Address, BytesN, Env, String};

// ── SEP-41 Token interface ────────────────────────────────────────────────────

#[contractclient(name = "TokenClient")]
pub trait TokenInterface {
    fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String);
    fn transfer(env: Env, from: Address, to: Address, amount: i128);
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);
    fn balance(env: Env, id: Address) -> i128;
    fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);
    fn allowance(env: Env, from: Address, spender: Address) -> i128;
    fn mint(env: Env, to: Address, amount: i128);
    fn burn(env: Env, from: Address, amount: i128);
    fn decimals(env: Env) -> u32;
    fn name(env: Env) -> String;
    fn symbol(env: Env) -> String;
    fn total_supply(env: Env) -> i128;
}

// ── Pair (AMM pool) interface ─────────────────────────────────────────────────

#[contractclient(name = "PairClient")]
pub trait PairInterface {
    fn initialize(env: Env, token_x: Address, token_y: Address, factory: Address);

    fn add_liquidity(
        env: Env,
        caller: Address,
        amount_x_desired: i128,
        amount_y_desired: i128,
        amount_x_min: i128,
        amount_y_min: i128,
        to: Address,
    ) -> (i128, i128, i128);

    fn remove_liquidity(
        env: Env,
        caller: Address,
        liquidity: i128,
        amount_x_min: i128,
        amount_y_min: i128,
        to: Address,
    ) -> (i128, i128);

    fn swap(
        env: Env,
        caller: Address,
        amount_x_out: i128,
        amount_y_out: i128,
        to: Address,
    );

    fn sync(env: Env);
    fn skim(env: Env, to: Address);

    fn get_reserves(env: Env) -> (i128, i128);
    fn token_x(env: Env) -> Address;
    fn token_y(env: Env) -> Address;
    fn factory(env: Env) -> Address;

    // LP token SEP-41 interface
    fn lp_transfer(env: Env, from: Address, to: Address, amount: i128);
    fn lp_transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128);
    fn lp_approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32);
    fn lp_allowance(env: Env, from: Address, spender: Address) -> i128;
    fn lp_balance(env: Env, account: Address) -> i128;
    fn lp_total_supply(env: Env) -> i128;
    fn lp_decimals(env: Env) -> u32;
    fn lp_name(env: Env) -> String;
    fn lp_symbol(env: Env) -> String;
}

// ── Factory interface ─────────────────────────────────────────────────────────

#[contractclient(name = "FactoryClient")]
pub trait FactoryInterface {
    fn initialize(env: Env, admin: Address, fee_to_setter: Address, pair_wasm_hash: BytesN<32>);
    fn create_pair(env: Env, token_a: Address, token_b: Address) -> Address;
    fn get_pair(env: Env, token_a: Address, token_b: Address) -> Address;
    fn all_pairs(env: Env, index: u32) -> Address;
    fn all_pairs_length(env: Env) -> u32;
    fn fee_to(env: Env) -> Option<Address>;
    fn fee_to_setter(env: Env) -> Address;
    fn pair_exists(env: Env, token_a: Address, token_b: Address) -> bool;
    fn set_fee_to(env: Env, fee_to: Address);
    fn set_fee_to_setter(env: Env, new_setter: Address);
    fn update_pair_wasm_hash(env: Env, new_hash: BytesN<32>);
}
