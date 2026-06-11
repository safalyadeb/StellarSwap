use soroban_sdk::{contract, contractimpl, panic_with_error, Address, Env, String};

use stellar_swap_shared::errors::StellarSwapError;

use crate::storage::{self, DataKey};

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    pub fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic_with_error!(&env, StellarSwapError::AlreadyInitialized);
        }
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        storage::extend_instance(&env);

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));

        let key = DataKey::Balance(to.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(bal + amount));
        storage::extend_persistent(&env, &key);
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    // ── SEP-41 ────────────────────────────────────────────────────────────

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        storage::extend_instance(&env);
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        storage::extend_instance(&env);
        Self::do_spend_allowance(&env, &from, &spender, amount);
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        storage::extend_instance(&env);

        let key = DataKey::Balance(from.clone());
        let bal: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if bal < amount {
            panic_with_error!(&env, StellarSwapError::InsufficientBalance);
        }
        env.storage().persistent().set(&key, &(bal - amount));
        storage::extend_persistent(&env, &key);

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalSupply, &(supply - amount));
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        storage::extend_instance(&env);
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let exp_key = DataKey::AllowanceExp(from.clone(), spender.clone());
        env.storage().persistent().set(&key, &amount);
        env.storage().persistent().set(&exp_key, &expiration_ledger);
        storage::extend_persistent(&env, &key);
        storage::extend_persistent(&env, &exp_key);
    }

    // ── View ──────────────────────────────────────────────────────────────

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let exp_key = DataKey::AllowanceExp(from.clone(), spender.clone());
        let exp: u32 = env.storage().persistent().get(&exp_key).unwrap_or(0);
        if exp < env.ledger().sequence() {
            return 0;
        }
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(id))
            .unwrap_or(0)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    // ── Internals ─────────────────────────────────────────────────────────

    fn do_transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        let from_key = DataKey::Balance(from.clone());
        let bal: i128 = env.storage().persistent().get(&from_key).unwrap_or(0);
        if bal < amount {
            panic_with_error!(env, StellarSwapError::InsufficientBalance);
        }
        env.storage().persistent().set(&from_key, &(bal - amount));
        storage::extend_persistent(env, &from_key);

        let to_key = DataKey::Balance(to.clone());
        let to_bal: i128 = env.storage().persistent().get(&to_key).unwrap_or(0);
        env.storage().persistent().set(&to_key, &(to_bal + amount));
        storage::extend_persistent(env, &to_key);
    }

    fn do_spend_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
        let exp_key = DataKey::AllowanceExp(from.clone(), spender.clone());
        let exp: u32 = env.storage().persistent().get(&exp_key).unwrap_or(0);
        if exp < env.ledger().sequence() {
            panic_with_error!(env, StellarSwapError::AllowanceExpired);
        }
        let key = DataKey::Allowance(from.clone(), spender.clone());
        let allowed: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if allowed < amount {
            panic_with_error!(env, StellarSwapError::InsufficientAllowance);
        }
        env.storage().persistent().set(&key, &(allowed - amount));
        storage::extend_persistent(env, &key);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, TokenContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register(TokenContract, ());
        let client = TokenContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(
            &admin,
            &7u32,
            &String::from_str(&env, "Test Token"),
            &String::from_str(&env, "TST"),
        );
        (env, client, admin)
    }

    #[test]
    fn test_mint_and_balance() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.mint(&user, &1_000_000);
        assert_eq!(client.balance(&user), 1_000_000);
        assert_eq!(client.total_supply(), 1_000_000);
    }

    #[test]
    fn test_transfer() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &1_000_000);
        client.transfer(&alice, &bob, &400_000);
        assert_eq!(client.balance(&alice), 600_000);
        assert_eq!(client.balance(&bob), 400_000);
    }

    #[test]
    fn test_approve_and_transfer_from() {
        let (env, client, _admin) = setup();
        let alice = Address::generate(&env);
        let spender = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &1_000_000);
        client.approve(&alice, &spender, &500_000, &999_999_999u32);
        client.transfer_from(&spender, &alice, &bob, &300_000);
        assert_eq!(client.balance(&alice), 700_000);
        assert_eq!(client.balance(&bob), 300_000);
        assert_eq!(client.allowance(&alice, &spender), 200_000);
    }

    #[test]
    fn test_burn() {
        let (env, client, _admin) = setup();
        let user = Address::generate(&env);
        client.mint(&user, &1_000_000);
        client.burn(&user, &400_000);
        assert_eq!(client.balance(&user), 600_000);
        assert_eq!(client.total_supply(), 600_000);
    }

    #[test]
    #[should_panic]
    fn test_transfer_insufficient_balance_panics() {
        let (env, client, _) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        client.mint(&alice, &100);
        client.transfer(&alice, &bob, &200);
    }

    #[test]
    fn test_decimals_name_symbol() {
        let (env, client, _) = setup();
        assert_eq!(client.decimals(), 7);
        assert_eq!(client.name(), String::from_str(&env, "Test Token"));
        assert_eq!(client.symbol(), String::from_str(&env, "TST"));
    }
}
