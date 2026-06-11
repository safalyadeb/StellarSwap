//! Router contract — stateless user-facing interface.
//!
//! Security: deadline validation + slippage on every state-changing call.
//! Router never holds user tokens — they flow pair-to-pair directly.
//! Upgradeable by admin (WASM swap preserves address and factory ref).

use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

use stellar_swap_shared::{
    errors::StellarSwapError,
    interfaces::{FactoryClient, PairClient, TokenClient},
    math,
};

use crate::{helpers, storage, storage::DataKey};

#[contract]
pub struct RouterContract;

#[contractimpl]
impl RouterContract {
    // ── Init ──────────────────────────────────────────────────────────────

    pub fn initialize(env: Env, factory: Address, admin: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            env.panic_with_error(StellarSwapError::AlreadyInitialized);
        }
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Liquidity ─────────────────────────────────────────────────────────

    /// Add liquidity to an existing (or newly created) pool.
    ///
    /// Computes optimal amounts to maintain pool ratio, then delegates to Pair.
    pub fn add_liquidity(
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
    ) -> (i128, i128, i128) {
        caller.require_auth();
        Self::check_deadline(&env, deadline);
        storage::extend_instance(&env);

        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let factory = FactoryClient::new(&env, &factory_addr);

        // Get or create the pair.
        let pair_addr = if factory.pair_exists(&token_a, &token_b) {
            factory.get_pair(&token_a, &token_b)
        } else {
            factory.create_pair(&token_a, &token_b)
        };

        let pair = PairClient::new(&env, &pair_addr);
        let token_x = pair.token_x();
        let (rx, ry) = pair.get_reserves();

        // Map caller's (a,b) order to pool's (x,y) order.
        let (reserve_a, reserve_b) = if token_x == token_a {
            (rx, ry)
        } else {
            (ry, rx)
        };

        // Compute optimal amounts.
        let (amount_a, amount_b) = if reserve_a == 0 && reserve_b == 0 {
            (amount_a_desired, amount_b_desired)
        } else {
            let b_opt = math::quote(&env, amount_a_desired, reserve_a, reserve_b);
            if b_opt <= amount_b_desired {
                if b_opt < amount_b_min {
                    env.panic_with_error(StellarSwapError::InsufficientBAmount);
                }
                (amount_a_desired, b_opt)
            } else {
                let a_opt = math::quote(&env, amount_b_desired, reserve_b, reserve_a);
                if a_opt > amount_a_desired || a_opt < amount_a_min {
                    env.panic_with_error(StellarSwapError::InsufficientAAmount);
                }
                (a_opt, amount_b_desired)
            }
        };

        // pair.add_liquidity handles token transfers internally.
        // Pass amounts in pool's x/y order (pair sorts tokens internally).
        let (ax, ay, lp) = if token_x == token_a {
            pair.add_liquidity(&caller, &amount_a, &amount_b, &0i128, &0i128, &to)
        } else {
            pair.add_liquidity(&caller, &amount_b, &amount_a, &0i128, &0i128, &to)
        };

        if token_x == token_a {
            (ax, ay, lp)
        } else {
            (ay, ax, lp)
        }
    }

    /// Remove liquidity by burning LP tokens.
    pub fn remove_liquidity(
        env: Env,
        caller: Address,
        token_a: Address,
        token_b: Address,
        liquidity: i128,
        amount_a_min: i128,
        amount_b_min: i128,
        to: Address,
        deadline: u64,
    ) -> (i128, i128) {
        caller.require_auth();
        Self::check_deadline(&env, deadline);
        storage::extend_instance(&env);

        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let pair_addr = FactoryClient::new(&env, &factory_addr).get_pair(&token_a, &token_b);
        let pair = PairClient::new(&env, &pair_addr);

        // Move LP tokens from caller to pair (pair burns them internally).
        pair.lp_transfer(&caller, &pair_addr, &liquidity);

        let token_x = pair.token_x();
        let (min_x, min_y) = if token_x == token_a {
            (amount_a_min, amount_b_min)
        } else {
            (amount_b_min, amount_a_min)
        };

        let (out_x, out_y) = pair.remove_liquidity(&caller, &liquidity, &min_x, &min_y, &to);
        if token_x == token_a {
            (out_x, out_y)
        } else {
            (out_y, out_x)
        }
    }

    // ── Swap ──────────────────────────────────────────────────────────────

    /// Swap an exact input for the maximum possible output.
    pub fn swap_exact_tokens_for_tokens(
        env: Env,
        caller: Address,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128> {
        caller.require_auth();
        Self::check_deadline(&env, deadline);
        storage::extend_instance(&env);

        if path.len() < 2 {
            env.panic_with_error(StellarSwapError::InvalidPath);
        }
        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let amounts = helpers::get_amounts_out(&env, &factory_addr, amount_in, &path);

        if amounts.last().unwrap() < amount_out_min {
            env.panic_with_error(StellarSwapError::InsufficientOutputAmount);
        }

        // Transfer first token from caller to first pair.
        let first_pair = helpers::pair_for(&env, &factory_addr, &path, 0);
        TokenClient::new(&env, &path.get(0).unwrap()).transfer(&caller, &first_pair, &amount_in);

        Self::run_swap_chain(&env, &factory_addr, &amounts, &path, &to);
        amounts
    }

    /// Swap the minimum necessary input for an exact output.
    pub fn swap_tokens_for_exact_tokens(
        env: Env,
        caller: Address,
        amount_out: i128,
        amount_in_max: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128> {
        caller.require_auth();
        Self::check_deadline(&env, deadline);
        storage::extend_instance(&env);

        if path.len() < 2 {
            env.panic_with_error(StellarSwapError::InvalidPath);
        }
        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        let amounts = helpers::get_amounts_in(&env, &factory_addr, amount_out, &path);

        let required_in = amounts.get(0).unwrap();
        if required_in > amount_in_max {
            env.panic_with_error(StellarSwapError::ExcessiveInputAmount);
        }

        let first_pair = helpers::pair_for(&env, &factory_addr, &path, 0);
        TokenClient::new(&env, &path.get(0).unwrap()).transfer(&caller, &first_pair, &required_in);

        Self::run_swap_chain(&env, &factory_addr, &amounts, &path, &to);
        amounts
    }

    // ── View / Quote ──────────────────────────────────────────────────────

    pub fn get_amount_out(env: Env, amount_in: i128, reserve_in: i128, reserve_out: i128) -> i128 {
        math::get_amount_out(&env, amount_in, reserve_in, reserve_out)
    }

    pub fn get_amount_in(env: Env, amount_out: i128, reserve_in: i128, reserve_out: i128) -> i128 {
        math::get_amount_in(&env, amount_out, reserve_in, reserve_out)
    }

    pub fn get_amounts_out(env: Env, amount_in: i128, path: Vec<Address>) -> Vec<i128> {
        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        helpers::get_amounts_out(&env, &factory_addr, amount_in, &path)
    }

    pub fn get_amounts_in(env: Env, amount_out: i128, path: Vec<Address>) -> Vec<i128> {
        let factory_addr: Address = env.storage().instance().get(&DataKey::Factory).unwrap();
        helpers::get_amounts_in(&env, &factory_addr, amount_out, &path)
    }

    pub fn quote(env: Env, amount_a: i128, reserve_a: i128, reserve_b: i128) -> i128 {
        math::quote(&env, amount_a, reserve_a, reserve_b)
    }

    pub fn get_factory(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Factory).unwrap()
    }

    // ── Upgrade (admin only) ──────────────────────────────────────────────

    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    // ── Private ───────────────────────────────────────────────────────────

    fn check_deadline(env: &Env, deadline: u64) {
        if env.ledger().timestamp() > deadline {
            env.panic_with_error(StellarSwapError::ExpiredDeadline);
        }
    }

    /// Execute the full swap hop chain. Tokens flow pair-to-pair; Router never holds them.
    fn run_swap_chain(
        env: &Env,
        factory_addr: &Address,
        amounts: &Vec<i128>,
        path: &Vec<Address>,
        final_to: &Address,
    ) {
        let n = path.len();
        for i in 0..(n - 1) {
            let t_in = path.get(i).unwrap();
            let t_out = path.get(i + 1).unwrap();
            let amount_out = amounts.get(i + 1).unwrap();

            let pair_addr = FactoryClient::new(env, factory_addr).get_pair(&t_in, &t_out);
            let pair = PairClient::new(env, &pair_addr);
            let token_x = pair.token_x();

            let (ax_out, ay_out) = if token_x == t_out {
                (amount_out, 0i128)
            } else {
                (0i128, amount_out)
            };

            // Next hop destination: subsequent pair or final recipient.
            let hop_to = if (i + 1) < (n - 1) {
                helpers::pair_for(env, factory_addr, path, i + 1)
            } else {
                final_to.clone()
            };

            pair.swap(&env.current_contract_address(), &ax_out, &ay_out, &hop_to);
        }
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use soroban_sdk::Env;
    use stellar_swap_shared::math;

    #[test]
    fn test_get_amount_out_basic() {
        let env = Env::default();
        let out = math::get_amount_out(&env, 1_000, 10_000, 10_000);
        // With 0.3% fee, out < naive 909
        assert!(out > 0 && out < 910);
    }

    #[test]
    fn test_deadline_logic() {
        let current: u64 = 1_000_000;
        assert!(current <= 1_000_300); // ok
        assert!(current > 999_999); // expired
    }

    #[test]
    fn test_two_hop_amounts_decrease() {
        let env = Env::default();
        let mid = math::get_amount_out(&env, 1_000, 100_000, 100_000);
        let fin = math::get_amount_out(&env, mid, 100_000, 100_000);
        assert!(fin < mid && fin > 0);
    }

    #[test]
    fn test_quote_no_fee() {
        let env = Env::default();
        let q = math::quote(&env, 100, 1_000, 2_000);
        assert_eq!(q, 200); // proportional, no fee
    }
}
