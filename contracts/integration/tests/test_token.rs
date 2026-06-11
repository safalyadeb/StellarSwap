mod common;
use common::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

// ── Happy path ────────────────────────────────────────────────────────────────

#[test]
fn mint_balance_supply() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");

    tok.mint(&user, &5_000_000);
    assert_eq!(tok.balance(&user), 5_000_000);
    assert_eq!(tok.total_supply(), 5_000_000);
}

#[test]
fn transfer_moves_balance() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    tok.mint(&alice, &1_000_000);
    tok.transfer(&alice, &bob, &600_000);
    assert_eq!(tok.balance(&alice), 400_000);
    assert_eq!(tok.balance(&bob), 600_000);
}

#[test]
fn approve_and_transfer_from() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");
    let alice = Address::generate(&env);
    let spender = Address::generate(&env);
    let bob = Address::generate(&env);

    tok.mint(&alice, &1_000_000);
    tok.approve(&alice, &spender, &500_000, &999_999_999u32);
    tok.transfer_from(&spender, &alice, &bob, &300_000);
    assert_eq!(tok.balance(&alice), 700_000);
    assert_eq!(tok.balance(&bob), 300_000);
    assert_eq!(tok.allowance(&alice, &spender), 200_000);
}

#[test]
fn burn_reduces_supply() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");
    let user = Address::generate(&env);

    tok.mint(&user, &1_000_000);
    tok.burn(&user, &400_000);
    assert_eq!(tok.balance(&user), 600_000);
    assert_eq!(tok.total_supply(), 600_000);
}

#[test]
fn metadata_is_set_correctly() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "ALPHA");
    assert_eq!(tok.decimals(), 7);
    assert_eq!(tok.symbol(), String::from_str(&env, "ALPHA"));
}

// ── Failure cases ─────────────────────────────────────────────────────────────

#[test]
#[should_panic]
fn transfer_over_balance_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    tok.mint(&alice, &100);
    tok.transfer(&alice, &bob, &101);
}

#[test]
#[should_panic]
fn double_initialize_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let tok = mk_token(&env, &admin, "TST");
    tok.initialize(
        &admin,
        &7u32,
        &String::from_str(&env, "Second"),
        &String::from_str(&env, "SEC"),
    );
}
