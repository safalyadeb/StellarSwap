//! Pair contract — core AMM for a single token pair.
//!
//! Constant product invariant: x * y = k
//! Fee: 0.3% retained in pool on every swap (997/1000 factor).
//! Immutable after initialization — no admin, no upgrade, no pause.

use soroban_sdk::{contract, contractimpl, Address, Env, String};

use stellar_swap_shared::{
    errors::StellarSwapError,
    interfaces::TokenClient,
    math::{self, checked_mul, MINIMUM_LIQUIDITY},
};

use crate::{events, lp_token, storage, storage::DataKey};

fn token<'a>(env: &'a Env, addr: &Address) -> TokenClient<'a> {
    TokenClient::new(env, addr)
}

#[contract]
pub struct PairContract;

#[contractimpl]
impl PairContract {
    // ── Initialization ────────────────────────────────────────────────────

    /// One-time setup called by Factory immediately after deployment.
    pub fn initialize(env: Env, token_x: Address, token_y: Address, factory: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            env.panic_with_error(StellarSwapError::AlreadyInitialized);
        }
        storage::extend_instance(&env);

        env.storage().instance().set(&DataKey::TokenX, &token_x);
        env.storage().instance().set(&DataKey::TokenY, &token_y);
        env.storage().instance().set(&DataKey::Factory, &factory);
        env.storage().instance().set(&DataKey::ReserveX, &0i128);
        env.storage().instance().set(&DataKey::ReserveY, &0i128);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        env.storage().instance().set(&DataKey::KLast, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Liquidity ─────────────────────────────────────────────────────────

    /// Add liquidity. Returns (amount_x_used, amount_y_used, lp_minted).
    pub fn add_liquidity(
        env: Env,
        caller: Address,
        amount_x_desired: i128,
        amount_y_desired: i128,
        amount_x_min: i128,
        amount_y_min: i128,
        to: Address,
    ) -> (i128, i128, i128) {
        caller.require_auth();
        storage::extend_instance(&env);

        let token_x: Address = env.storage().instance().get(&DataKey::TokenX).unwrap();
        let token_y: Address = env.storage().instance().get(&DataKey::TokenY).unwrap();
        let this = env.current_contract_address();

        let (reserve_x, reserve_y) = storage::get_reserves(&env);

        // Compute optimal amounts to preserve current price ratio.
        let (amount_x, amount_y) = if reserve_x == 0 && reserve_y == 0 {
            (amount_x_desired, amount_y_desired)
        } else {
            let y_opt = math::quote(&env, amount_x_desired, reserve_x, reserve_y);
            if y_opt <= amount_y_desired {
                if y_opt < amount_y_min {
                    env.panic_with_error(StellarSwapError::InsufficientBAmount);
                }
                (amount_x_desired, y_opt)
            } else {
                let x_opt = math::quote(&env, amount_y_desired, reserve_y, reserve_x);
                if x_opt > amount_x_desired {
                    env.panic_with_error(StellarSwapError::InsufficientAAmount);
                }
                if x_opt < amount_x_min {
                    env.panic_with_error(StellarSwapError::InsufficientAAmount);
                }
                (x_opt, amount_y_desired)
            }
        };

        // Transfer from caller to this pool.
        token(&env, &token_x).transfer(&caller, &this, &amount_x);
        token(&env, &token_y).transfer(&caller, &this, &amount_y);

        // Compute LP to mint.
        let total_supply = storage::get_total_supply(&env);
        let lp_minted = if total_supply == 0 {
            let product = checked_mul(&env, amount_x, amount_y);
            let lp = math::sqrt(product) - MINIMUM_LIQUIDITY;
            if lp <= 0 {
                env.panic_with_error(StellarSwapError::InsufficientLiquidityMinted);
            }
            // Lock MINIMUM_LIQUIDITY permanently — inflates total_supply
            // with no recipient, making these tokens unredeemable forever.
            lp_token::lock_forever(&env, MINIMUM_LIQUIDITY);
            lp
        } else {
            let lp_x = amount_x * total_supply / reserve_x;
            let lp_y = amount_y * total_supply / reserve_y;
            lp_x.min(lp_y)
        };

        if lp_minted <= 0 {
            env.panic_with_error(StellarSwapError::InsufficientLiquidityMinted);
        }
        lp_token::mint(&env, &to, lp_minted);

        // Sync reserves from actual token balances.
        let new_x = token(&env, &token_x).balance(&this);
        let new_y = token(&env, &token_y).balance(&this);
        storage::set_reserves(&env, new_x, new_y);

        events::liquidity_added(&env, &caller, amount_x, amount_y, lp_minted);
        (amount_x, amount_y, lp_minted)
    }

    /// Remove liquidity by burning LP tokens. Returns (amount_x, amount_y).
    pub fn remove_liquidity(
        env: Env,
        caller: Address,
        liquidity: i128,
        amount_x_min: i128,
        amount_y_min: i128,
        to: Address,
    ) -> (i128, i128) {
        caller.require_auth();
        storage::extend_instance(&env);

        if liquidity <= 0 {
            env.panic_with_error(StellarSwapError::InsufficientLiquidity);
        }

        let token_x: Address = env.storage().instance().get(&DataKey::TokenX).unwrap();
        let token_y: Address = env.storage().instance().get(&DataKey::TokenY).unwrap();
        let this = env.current_contract_address();

        let (reserve_x, reserve_y) = storage::get_reserves(&env);
        let total_supply = storage::get_total_supply(&env);
        if total_supply == 0 {
            env.panic_with_error(StellarSwapError::InsufficientLiquidity);
        }

        let amount_x = liquidity * reserve_x / total_supply;
        let amount_y = liquidity * reserve_y / total_supply;

        if amount_x <= 0 || amount_y <= 0 {
            env.panic_with_error(StellarSwapError::InsufficientLiquidityBurned);
        }
        if amount_x < amount_x_min {
            env.panic_with_error(StellarSwapError::InsufficientAAmount);
        }
        if amount_y < amount_y_min {
            env.panic_with_error(StellarSwapError::InsufficientBAmount);
        }

        lp_token::burn(&env, &caller, liquidity);

        token(&env, &token_x).transfer(&this, &to, &amount_x);
        token(&env, &token_y).transfer(&this, &to, &amount_y);

        let new_x = token(&env, &token_x).balance(&this);
        let new_y = token(&env, &token_y).balance(&this);
        storage::set_reserves(&env, new_x, new_y);

        events::liquidity_removed(&env, &caller, amount_x, amount_y, liquidity);
        (amount_x, amount_y)
    }

    // ── Swap ──────────────────────────────────────────────────────────────

    /// Execute a swap. Router calls this after transferring input tokens.
    ///
    /// Exactly one of amount_x_out / amount_y_out must be > 0.
    /// Security: fee-adjusted invariant check is the last line of defense.
    pub fn swap(
        env: Env,
        caller: Address,
        amount_x_out: i128,
        amount_y_out: i128,
        to: Address,
    ) {
        caller.require_auth();
        storage::extend_instance(&env);

        if amount_x_out <= 0 && amount_y_out <= 0 {
            env.panic_with_error(StellarSwapError::InsufficientOutputAmount);
        }
        if amount_x_out > 0 && amount_y_out > 0 {
            env.panic_with_error(StellarSwapError::InsufficientOutputAmount);
        }

        let token_x: Address = env.storage().instance().get(&DataKey::TokenX).unwrap();
        let token_y: Address = env.storage().instance().get(&DataKey::TokenY).unwrap();
        let this = env.current_contract_address();

        let (reserve_x, reserve_y) = storage::get_reserves(&env);

        if amount_x_out >= reserve_x {
            env.panic_with_error(StellarSwapError::InsufficientReserve);
        }
        if amount_y_out >= reserve_y {
            env.panic_with_error(StellarSwapError::InsufficientReserve);
        }
        if to == token_x || to == token_y {
            env.panic_with_error(StellarSwapError::InvalidTo);
        }

        // Transfer output tokens to recipient.
        if amount_x_out > 0 {
            token(&env, &token_x).transfer(&this, &to, &amount_x_out);
        }
        if amount_y_out > 0 {
            token(&env, &token_y).transfer(&this, &to, &amount_y_out);
        }

        // Derive input amounts from balance deltas.
        let balance_x = token(&env, &token_x).balance(&this);
        let balance_y = token(&env, &token_y).balance(&this);

        let amount_x_in = if balance_x > reserve_x - amount_x_out {
            balance_x - (reserve_x - amount_x_out)
        } else {
            0
        };
        let amount_y_in = if balance_y > reserve_y - amount_y_out {
            balance_y - (reserve_y - amount_y_out)
        } else {
            0
        };

        if amount_x_in <= 0 && amount_y_in <= 0 {
            env.panic_with_error(StellarSwapError::InsufficientInputAmount);
        }

        // Fee-adjusted constant product invariant check.
        // (balance_x*1000 - amount_x_in*3) * (balance_y*1000 - amount_y_in*3)
        //   >= reserve_x * reserve_y * 1000^2
        let bx_adj = checked_mul(&env, balance_x, 1000)
            - checked_mul(&env, amount_x_in, 3);
        let by_adj = checked_mul(&env, balance_y, 1000)
            - checked_mul(&env, amount_y_in, 3);

        let k_new = checked_mul(&env, bx_adj, by_adj);
        let k_old = checked_mul(
            &env,
            checked_mul(&env, reserve_x, 1000),
            checked_mul(&env, reserve_y, 1000),
        );

        if k_new < k_old {
            env.panic_with_error(StellarSwapError::InvariantViolation);
        }

        storage::set_reserves(&env, balance_x, balance_y);

        let (token_in, amount_in, amount_out) = if amount_x_in > 0 {
            (&token_x, amount_x_in, amount_y_out)
        } else {
            (&token_y, amount_y_in, amount_x_out)
        };
        let token_out = if amount_x_out > 0 { &token_x } else { &token_y };

        events::swap(&env, &caller, amount_in, amount_out, token_in, token_out);
    }

    // ── Maintenance ───────────────────────────────────────────────────────

    pub fn sync(env: Env) {
        storage::extend_instance(&env);
        let token_x: Address = env.storage().instance().get(&DataKey::TokenX).unwrap();
        let token_y: Address = env.storage().instance().get(&DataKey::TokenY).unwrap();
        let this = env.current_contract_address();
        let bx = token(&env, &token_x).balance(&this);
        let by = token(&env, &token_y).balance(&this);
        storage::set_reserves(&env, bx, by);
        events::sync(&env, bx, by);
    }

    pub fn skim(env: Env, to: Address) {
        storage::extend_instance(&env);
        let token_x: Address = env.storage().instance().get(&DataKey::TokenX).unwrap();
        let token_y: Address = env.storage().instance().get(&DataKey::TokenY).unwrap();
        let this = env.current_contract_address();
        let (rx, ry) = storage::get_reserves(&env);
        let bx = token(&env, &token_x).balance(&this);
        let by = token(&env, &token_y).balance(&this);
        if bx > rx {
            token(&env, &token_x).transfer(&this, &to, &(bx - rx));
        }
        if by > ry {
            token(&env, &token_y).transfer(&this, &to, &(by - ry));
        }
    }

    // ── View ──────────────────────────────────────────────────────────────

    pub fn get_reserves(env: Env) -> (i128, i128) {
        storage::get_reserves(&env)
    }

    pub fn token_x(env: Env) -> Address {
        env.storage().instance().get(&DataKey::TokenX).unwrap()
    }

    pub fn token_y(env: Env) -> Address {
        env.storage().instance().get(&DataKey::TokenY).unwrap()
    }

    pub fn factory(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Factory).unwrap()
    }

    // ── LP Token SEP-41 ───────────────────────────────────────────────────

    pub fn lp_transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        storage::extend_instance(&env);
        lp_token::transfer(&env, &from, &to, amount);
    }

    pub fn lp_transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        storage::extend_instance(&env);
        lp_token::transfer_from(&env, &spender, &from, &to, amount);
    }

    pub fn lp_approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        storage::extend_instance(&env);
        lp_token::approve(&env, &from, &spender, amount, expiration_ledger);
    }

    pub fn lp_allowance(env: Env, from: Address, spender: Address) -> i128 {
        let (amount, exp) = storage::get_lp_allowance(&env, &from, &spender);
        if exp < env.ledger().sequence() { 0 } else { amount }
    }

    pub fn lp_balance(env: Env, account: Address) -> i128 {
        storage::get_lp_balance(&env, &account)
    }

    pub fn lp_total_supply(env: Env) -> i128 {
        storage::get_total_supply(&env)
    }

    pub fn lp_decimals(_env: Env) -> u32 { 7 }

    pub fn lp_name(env: Env) -> String {
        String::from_str(&env, "StellarSwap LP Token")
    }

    pub fn lp_symbol(env: Env) -> String {
        String::from_str(&env, "SLP")
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use soroban_sdk::{testutils::Address as _, Address, Env};
    use stellar_swap_shared::math::{self, sqrt, MINIMUM_LIQUIDITY};

    #[test]
    fn test_invariant_holds_through_swaps() {
        let env = Env::default();
        let mut rx = 1_000_000i128;
        let mut ry = 1_000_000i128;
        let k0 = rx * ry;

        for i in 1..=20i128 {
            let amount_in = i * 5_000;
            let out = math::get_amount_out(&env, amount_in, rx, ry);
            rx += amount_in;
            ry -= out;
            assert!(rx * ry >= k0, "invariant failed at step {i}");
        }
        // k should have grown (fees)
        assert!(rx * ry > k0);
    }

    #[test]
    fn test_first_lp_formula() {
        let (amount_x, amount_y) = (10_000i128, 10_000i128);
        let lp = sqrt(amount_x * amount_y) - MINIMUM_LIQUIDITY;
        assert_eq!(lp, 9_000);
    }

    #[test]
    fn test_subsequent_lp_formula() {
        let (rx, ry, ts) = (10_000i128, 10_000i128, 10_000i128);
        let (ax, ay) = (5_000i128, 5_000i128);
        let lp = (ax * ts / rx).min(ay * ts / ry);
        assert_eq!(lp, 5_000);
    }

    #[test]
    fn test_lp_redemption_proportional() {
        let (rx, ry, ts) = (15_000i128, 15_000i128, 15_000i128);
        let burned = 5_000i128;
        let out_x = burned * rx / ts;
        let out_y = burned * ry / ts;
        assert_eq!(out_x, 5_000);
        assert_eq!(out_y, 5_000);
    }
}
