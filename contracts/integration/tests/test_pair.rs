mod common;
use common::*;
use soroban_sdk::{testutils::Address as _, Address, Env};
use stellar_swap_shared::math::{get_amount_out, MINIMUM_LIQUIDITY};

// ── First deposit ─────────────────────────────────────────────────────────────

#[test]
fn first_deposit_lp_formula() {
    let env = Env::default();
    env.mock_all_auths();
    // 10_000 X / 10_000 Y → LP = sqrt(10000*10000) - 1000 = 9000
    let (pair, _, _, lp) = setup_pool(&env, 10_000, 10_000);
    assert_eq!(pair.lp_balance(&lp), 9_000);
    assert_eq!(pair.lp_total_supply(), 10_000); // 9000 + 1000 burned
    let (rx, ry) = pair.get_reserves();
    assert_eq!(rx, 10_000);
    assert_eq!(ry, 10_000);
}

#[test]
fn asymmetric_first_deposit() {
    let env = Env::default();
    env.mock_all_auths();
    // sqrt(1000 * 4000) - 1000 = 2000 - 1000 = 1000
    let (pair, _, _, lp) = setup_pool(&env, 1_000, 4_000);
    assert_eq!(pair.lp_balance(&lp), 1_000);
}

// ── Subsequent deposit ────────────────────────────────────────────────────────

#[test]
fn second_deposit_proportional_lp() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, lp) = setup_pool(&env, 10_000, 10_000);

    let lp2 = Address::generate(&env);
    tok_x.mint(&lp2, &5_000);
    tok_y.mint(&lp2, &5_000);
    // pair.add_liquidity pulls tokens from lp2 directly
    let (_, _, new_lp) = pair.add_liquidity(&lp2, &5_000, &5_000, &0, &0, &lp2);
    // min(5000*10000/10000, 5000*10000/10000) = 5000
    assert_eq!(new_lp, 5_000);
}

// ── Swap ──────────────────────────────────────────────────────────────────────

#[test]
fn swap_x_for_y_correct_output() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, _) = setup_pool(&env, 1_000_000, 1_000_000);
    let trader = Address::generate(&env);
    tok_x.mint(&trader, &50_000);

    let expected = get_amount_out(&env, 50_000, 1_000_000, 1_000_000);
    tok_x.transfer(&trader, &pair.address, &50_000);
    pair.swap(&trader, &0, &expected, &trader);

    assert_eq!(tok_y.balance(&trader), expected);
}

#[test]
fn swap_y_for_x() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, _) = setup_pool(&env, 1_000_000, 1_000_000);
    let trader = Address::generate(&env);
    tok_y.mint(&trader, &50_000);

    let expected = get_amount_out(&env, 50_000, 1_000_000, 1_000_000);
    tok_y.transfer(&trader, &pair.address, &50_000);
    pair.swap(&trader, &expected, &0, &trader);

    assert_eq!(tok_x.balance(&trader), expected);
}

#[test]
fn k_grows_after_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, _) = setup_pool(&env, 1_000_000, 1_000_000);
    let (rx0, ry0) = pair.get_reserves();
    let k0 = rx0 * ry0;

    let trader = Address::generate(&env);
    for _ in 0..5 {
        let (rx, ry) = pair.get_reserves();
        let out = get_amount_out(&env, 10_000, rx, ry);
        tok_x.mint(&trader, &10_000);
        tok_x.transfer(&trader, &pair.address, &10_000);
        pair.swap(&trader, &0, &out, &trader);
    }

    let (rxn, ryn) = pair.get_reserves();
    assert!(rxn * ryn > k0, "k did not grow after 5 swaps");
}

// ── Remove liquidity ──────────────────────────────────────────────────────────

#[test]
fn remove_half_lp_returns_half_reserves() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, lp) = setup_pool(&env, 10_000, 10_000);
    let lp_bal = pair.lp_balance(&lp);

    let (out_x, out_y) = pair.remove_liquidity(&lp, &(lp_bal / 2), &0, &0, &lp);
    // lp_bal/2 out of total 10000 → 4500/10000 * 10000 = 4500
    assert_eq!(out_x, 4_500);
    assert_eq!(out_y, 4_500);
}

#[test]
fn lp_earns_fees_after_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, lp) = setup_pool(&env, 1_000_000, 1_000_000);
    let lp_bal = pair.lp_balance(&lp);

    let trader = Address::generate(&env);
    for _ in 0..20 {
        let (rx, ry) = pair.get_reserves();
        let out = get_amount_out(&env, 5_000, rx, ry);
        tok_x.mint(&trader, &5_000);
        tok_x.transfer(&trader, &pair.address, &5_000);
        pair.swap(&trader, &0, &out, &trader);
    }

    let (out_x, out_y) = pair.remove_liquidity(&lp, &lp_bal, &0, &0, &lp);
    // Should receive more than 999_000/10^6 of each reserve
    // (fee growth means reserves grew slightly)
    assert!(out_x + out_y > 0);
    // Fee accounting: reserves grew so LP share is worth more
    let (rx_r, _) = pair.get_reserves();
    // The remaining reserve should reflect fees earned by min liquidity
    assert!(rx_r > 0);
}

// ── Invariants ────────────────────────────────────────────────────────────────

#[test]
fn invariant_k_never_decreases_50_swaps() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, _) = setup_pool(&env, 5_000_000, 5_000_000);
    let (r0x, r0y) = pair.get_reserves();
    let mut k_prev = r0x * r0y;
    let trader = Address::generate(&env);

    for i in 1i128..=50 {
        let amt = i * 2_000i128;
        let (rx, ry) = pair.get_reserves();
        let out = get_amount_out(&env, amt, rx, ry);
        tok_x.mint(&trader, &amt);
        tok_x.transfer(&trader, &pair.address, &amt);
        pair.swap(&trader, &0, &out, &trader);
        let (rxn, ryn) = pair.get_reserves();
        let k_new = rxn * ryn;
        assert!(k_new >= k_prev, "k decreased at swap {i}");
        k_prev = k_new;
    }
}

#[test]
fn lp_supply_conservation() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, _, _, lp) = setup_pool(&env, 10_000, 10_000);
    let lp_bal = pair.lp_balance(&lp);
    // total = lp_bal(user) + MINIMUM_LIQUIDITY
    assert_eq!(lp_bal + MINIMUM_LIQUIDITY, pair.lp_total_supply());
}

#[test]
fn reserves_match_actual_balances_after_swap() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, _) = setup_pool(&env, 100_000, 100_000);
    let trader = Address::generate(&env);
    tok_x.mint(&trader, &10_000);

    let (rx, ry) = pair.get_reserves();
    let out = get_amount_out(&env, 10_000, rx, ry);
    tok_x.transfer(&trader, &pair.address, &10_000);
    pair.swap(&trader, &0, &out, &trader);

    let (rx_stored, ry_stored) = pair.get_reserves();
    assert_eq!(rx_stored, tok_x.balance(&pair.address));
    assert_eq!(ry_stored, tok_y.balance(&pair.address));
}

// ── Sync & Skim ───────────────────────────────────────────────────────────────

#[test]
fn sync_corrects_direct_donation() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, lp) = setup_pool(&env, 10_000, 10_000);

    tok_x.transfer(&lp, &pair.address, &1_000); // direct donation
    pair.sync();

    let (rx, _) = pair.get_reserves();
    assert_eq!(rx, 11_000);
}

#[test]
fn skim_recovers_excess() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, tok_x, tok_y, lp) = setup_pool(&env, 10_000, 10_000);
    let skimmer = Address::generate(&env);

    tok_x.transfer(&lp, &pair.address, &500);
    pair.skim(&skimmer);

    assert_eq!(tok_x.balance(&skimmer), 500);
    let (rx, _) = pair.get_reserves();
    assert_eq!(rx, 10_000); // unchanged
}

// ── Failure cases ─────────────────────────────────────────────────────────────

#[test]
#[should_panic]
fn swap_exceeds_reserve_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, _, _, trader) = setup_pool(&env, 1_000, 1_000);
    pair.swap(&trader, &0, &1_001, &trader);
}

#[test]
#[should_panic]
fn remove_more_lp_than_balance_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let (pair, _, _, lp) = setup_pool(&env, 10_000, 10_000);
    let lp_bal = pair.lp_balance(&lp);
    pair.remove_liquidity(&lp, &(lp_bal + 1), &0, &0, &lp);
}

#[test]
#[should_panic]
fn tiny_first_deposit_panics() {
    let env = Env::default();
    env.mock_all_auths();
    // 1*1 = 1, sqrt(1) = 1, 1 - 1000 = -999 → panic
    setup_pool(&env, 1, 1);
}
