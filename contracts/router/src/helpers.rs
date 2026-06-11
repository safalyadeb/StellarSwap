//! Routing helper functions: reserve lookups and multi-hop amount chains.

use soroban_sdk::{panic_with_error, Address, Env, Vec};

use stellar_swap_shared::{
    errors::StellarSwapError,
    interfaces::{FactoryClient, PairClient},
    math,
};

/// Returns (reserve_in, reserve_out) for a hop in the caller's token order.
pub fn get_reserves_ordered(
    env: &Env,
    factory_addr: &Address,
    token_in: &Address,
    token_out: &Address,
) -> (i128, i128) {
    let pair_addr = FactoryClient::new(env, factory_addr).get_pair(token_in, token_out);
    let pair = PairClient::new(env, &pair_addr);
    let tx = pair.token_x();
    let (rx, ry) = pair.get_reserves();
    if tx == *token_in { (rx, ry) } else { (ry, rx) }
}

/// Compute the output amounts for an exact-input multi-hop path.
/// Returns Vec of length path.len() where result[0] = amount_in.
pub fn get_amounts_out(
    env: &Env,
    factory_addr: &Address,
    amount_in: i128,
    path: &Vec<Address>,
) -> Vec<i128> {
    if path.len() < 2 {
        env.panic_with_error(StellarSwapError::InvalidPath);
    }
    let mut amounts = Vec::new(env);
    amounts.push_back(amount_in);

    for i in 0..(path.len() - 1) {
        let t_in = path.get(i).unwrap();
        let t_out = path.get(i + 1).unwrap();
        let (r_in, r_out) = get_reserves_ordered(env, factory_addr, &t_in, &t_out);
        let out = math::get_amount_out(env, amounts.last().unwrap(), r_in, r_out);
        amounts.push_back(out);
    }
    amounts
}

/// Compute the input amounts needed for an exact-output multi-hop path.
/// Returns Vec of length path.len() where result[0] = required input.
pub fn get_amounts_in(
    env: &Env,
    factory_addr: &Address,
    amount_out: i128,
    path: &Vec<Address>,
) -> Vec<i128> {
    let n = path.len();
    if n < 2 {
        env.panic_with_error(StellarSwapError::InvalidPath);
    }
    let mut amounts: Vec<i128> = Vec::new(env);
    for _ in 0..n {
        amounts.push_back(0i128);
    }
    amounts.set(n - 1, amount_out);

    for i in (0..(n - 1)).rev() {
        let t_in = path.get(i as u32).unwrap();
        let t_out = path.get(i as u32 + 1).unwrap();
        let (r_in, r_out) = get_reserves_ordered(env, factory_addr, &t_in, &t_out);
        let req = math::get_amount_in(env, amounts.get((i + 1) as u32).unwrap(), r_in, r_out);
        amounts.set(i as u32, req);
    }
    amounts
}

/// Get the pair address for hop `i` in a path.
pub fn pair_for(env: &Env, factory_addr: &Address, path: &Vec<Address>, i: u32) -> Address {
    FactoryClient::new(env, factory_addr)
        .get_pair(&path.get(i).unwrap(), &path.get(i + 1).unwrap())
}
