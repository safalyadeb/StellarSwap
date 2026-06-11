//! Factory contract — pool registry and deployer.
//!
//! Permissionless pool creation. Anyone calls create_pair(token_a, token_b).
//! Tokens are sorted lexicographically so pair lookup is order-independent.
//! Deploys each Pair with a deterministic address (salt = sorted token addresses).

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env};

use stellar_swap_shared::{errors::StellarSwapError, interfaces::PairClient};

use crate::{events, storage, storage::DataKey};

#[contract]
pub struct FactoryContract;

#[contractimpl]
impl FactoryContract {
    /// One-time initialization.
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_to_setter: Address,
        pair_wasm_hash: BytesN<32>,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            env.panic_with_error(StellarSwapError::AlreadyInitialized);
        }
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeToSetter, &fee_to_setter);
        env.storage().instance().set(&DataKey::PairWasmHash, &pair_wasm_hash);
        env.storage().instance().set(&DataKey::PairCount, &0u32);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    // ── Pool creation ─────────────────────────────────────────────────────

    /// Deploy and register a new Pair contract. Permissionless.
    pub fn create_pair(env: Env, token_a: Address, token_b: Address) -> Address {
        storage::extend_instance(&env);

        if token_a == token_b {
            env.panic_with_error(StellarSwapError::IdenticalAddresses);
        }
        if storage::get_pair(&env, &token_a, &token_b).is_some() {
            env.panic_with_error(StellarSwapError::PairAlreadyExists);
        }

        let (token_x, token_y) = storage::sort(token_a.clone(), token_b.clone());
        let wasm_hash: BytesN<32> = storage::get_pair_wasm_hash(&env);

        // Deterministic salt: sha256(prefix || pair_count_bytes).
        // The pair address is unique per factory and per creation slot.
        let count = storage::get_pair_count(&env);
        let count_bytes = count.to_be_bytes();
        let prefix = Bytes::from_slice(&env, b"stellarswap_pair_v1_");
        let mut salt_input = Bytes::new(&env);
        salt_input.append(&prefix);
        for b in count_bytes {
            salt_input.push_back(b);
        }
        let salt: BytesN<32> = env.crypto().sha256(&salt_input).into();

        let pair_addr = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_v2(wasm_hash, ());

        // Initialize the newly deployed Pair.
        PairClient::new(&env, &pair_addr).initialize(
            &token_x,
            &token_y,
            &env.current_contract_address(),
        );

        // Register pair.
        storage::set_pair(&env, token_x.clone(), token_y.clone(), pair_addr.clone());
        let count = storage::get_pair_count(&env);
        storage::push_pair(&env, count, pair_addr.clone());
        storage::set_pair_count(&env, count + 1);

        events::pair_created(&env, &token_x, &token_y, &pair_addr, count);
        pair_addr
    }

    // ── Views ─────────────────────────────────────────────────────────────

    pub fn pair_exists(env: Env, token_a: Address, token_b: Address) -> bool {
        storage::get_pair(&env, &token_a, &token_b).is_some()
    }

    pub fn get_pair(env: Env, token_a: Address, token_b: Address) -> Address {
        match storage::get_pair(&env, &token_a, &token_b) {
            Some(addr) => addr,
            None => env.panic_with_error(StellarSwapError::PairNotFound),
        }
    }

    pub fn all_pairs(env: Env, index: u32) -> Address {
        match storage::get_pair_at(&env, index) {
            Some(addr) => addr,
            None => env.panic_with_error(StellarSwapError::PairIndexOutOfBounds),
        }
    }

    pub fn all_pairs_length(env: Env) -> u32 {
        storage::get_pair_count(&env)
    }

    pub fn fee_to(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::FeeTo)
    }

    pub fn fee_to_setter(env: Env) -> Address {
        env.storage().instance().get(&DataKey::FeeToSetter).unwrap()
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    pub fn set_fee_to(env: Env, fee_to: Address) {
        let setter: Address = env.storage().instance().get(&DataKey::FeeToSetter).unwrap();
        setter.require_auth();
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::FeeTo, &fee_to);
    }

    pub fn set_fee_to_setter(env: Env, new_setter: Address) {
        let setter: Address = env.storage().instance().get(&DataKey::FeeToSetter).unwrap();
        setter.require_auth();
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::FeeToSetter, &new_setter);
    }

    pub fn update_pair_wasm_hash(env: Env, new_hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        storage::extend_instance(&env);
        env.storage().instance().set(&DataKey::PairWasmHash, &new_hash);
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use crate::storage::sort;
    use soroban_sdk::{testutils::Address as _, Address, Env};

    #[test]
    fn test_token_sort_is_order_independent() {
        let env = Env::default();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let (lo1, hi1) = sort(a.clone(), b.clone());
        let (lo2, hi2) = sort(b.clone(), a.clone());
        assert_eq!(lo1, lo2, "sorted low should be identical");
        assert_eq!(hi1, hi2, "sorted high should be identical");
    }

    #[test]
    fn test_sort_reflexive() {
        let env = Env::default();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        let (lo, _) = sort(a.clone(), b.clone());
        // lo must be the lexicographically smaller one
        assert!(lo == a || lo == b);
    }
}
