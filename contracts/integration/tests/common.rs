//! Shared setup helpers used across integration test files.

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};
use stellar_swap_factory::FactoryContract;
use stellar_swap_pair::PairContract;
use stellar_swap_router::RouterContract;
use stellar_swap_token::TokenContract;

pub use stellar_swap_factory::FactoryContractClient as FactoryClient;
pub use stellar_swap_pair::PairContractClient as PairClient;
pub use stellar_swap_router::RouterContractClient as RouterClient;
pub use stellar_swap_token::TokenContractClient as TokenClient;

pub fn deadline(env: &Env) -> u64 {
    env.ledger().timestamp() + 3_600
}

pub fn mk_token<'a>(env: &'a Env, admin: &Address, sym: &str) -> TokenClient<'a> {
    let id = env.register(TokenContract, ());
    let c = TokenClient::new(env, &id);
    c.initialize(admin, &7u32, &String::from_str(env, sym), &String::from_str(env, sym));
    c
}

pub fn mk_factory<'a>(env: &'a Env, admin: &Address) -> FactoryClient<'a> {
    let id = env.register(FactoryContract, ());
    let c = FactoryClient::new(env, &id);
    c.initialize(admin, admin, &BytesN::from_array(env, &[1u8; 32]));
    c
}

pub fn mk_router<'a>(env: &'a Env, factory: &Address, admin: &Address) -> RouterClient<'a> {
    let id = env.register(RouterContract, ());
    let c = RouterClient::new(env, &id);
    c.initialize(factory, admin);
    c
}

/// Set up a bare Pair with two tokens and seed it with liquidity.
/// Returns (pair_client, token_x_client, token_y_client, lp_provider_addr)
pub fn setup_pool<'a>(
    env: &'a Env,
    seed_x: i128,
    seed_y: i128,
) -> (PairClient<'a>, TokenClient<'a>, TokenClient<'a>, Address) {
    let admin = Address::generate(env);
    let lp = Address::generate(env);
    let factory_addr = Address::generate(env);

    let tok_x = mk_token(env, &admin, "TKX");
    let tok_y = mk_token(env, &admin, "TKY");
    tok_x.mint(&lp, &(seed_x * 100));
    tok_y.mint(&lp, &(seed_y * 100));

    let pair_id = env.register(PairContract, ());
    let pair = PairClient::new(env, &pair_id);
    pair.initialize(&tok_x.address, &tok_y.address, &factory_addr);

    // pair.add_liquidity handles its own token transfers from lp
    pair.add_liquidity(&lp, &seed_x, &seed_y, &0, &0, &lp);

    (pair, tok_x, tok_y, lp)
}
