mod common;
use common::*;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env};

#[test]
fn init_pair_count_is_zero() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    assert_eq!(factory.all_pairs_length(), 0);
}

#[test]
fn pair_exists_false_before_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    let ta = Address::generate(&env);
    let tb = Address::generate(&env);
    assert!(!factory.pair_exists(&ta, &tb));
}

#[test]
fn fee_to_setter_is_admin_initially() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    assert_eq!(factory.fee_to_setter(), admin);
}

#[test]
fn fee_to_is_none_initially() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    assert!(factory.fee_to().is_none());
}

#[test]
fn set_fee_to_stores_address() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    let recipient = Address::generate(&env);
    factory.set_fee_to(&recipient);
    assert_eq!(factory.fee_to(), Some(recipient));
}

#[test]
fn set_fee_to_setter_transfers_role() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    let new_setter = Address::generate(&env);
    factory.set_fee_to_setter(&new_setter);
    assert_eq!(factory.fee_to_setter(), new_setter);
}

#[test]
fn update_pair_wasm_hash_by_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    let new_hash = BytesN::from_array(&env, &[99u8; 32]);
    factory.update_pair_wasm_hash(&new_hash);
    // No panic = success (no getter for wasm hash, internal state)
}

#[test]
#[should_panic]
fn double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let factory = mk_factory(&env, &admin);
    factory.initialize(&admin, &admin, &BytesN::from_array(&env, &[2u8; 32]));
}
