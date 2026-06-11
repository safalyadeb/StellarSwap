use soroban_sdk::{contracttype, Address, Env};

// ── Swap event ────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct SwapEventData {
    pub from: Address,
    pub amount_in: i128,
    pub amount_out: i128,
    pub token_in: Address,
    pub token_out: Address,
}

pub fn swap(
    env: &Env,
    from: &Address,
    amount_in: i128,
    amount_out: i128,
    token_in: &Address,
    token_out: &Address,
) {
    let topics = (
        soroban_sdk::Symbol::new(env, "swap"),
        env.current_contract_address(),
    );
    let data = SwapEventData {
        from: from.clone(),
        amount_in,
        amount_out,
        token_in: token_in.clone(),
        token_out: token_out.clone(),
    };
    env.events().publish(topics, data);
}

// ── Liquidity added ───────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct LiquidityAddedData {
    pub provider: Address,
    pub amount_x: i128,
    pub amount_y: i128,
    pub lp_minted: i128,
}

pub fn liquidity_added(
    env: &Env,
    provider: &Address,
    amount_x: i128,
    amount_y: i128,
    lp_minted: i128,
) {
    let topics = (
        soroban_sdk::Symbol::new(env, "liquidity_added"),
        env.current_contract_address(),
    );
    env.events().publish(
        topics,
        LiquidityAddedData {
            provider: provider.clone(),
            amount_x,
            amount_y,
            lp_minted,
        },
    );
}

// ── Liquidity removed ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct LiquidityRemovedData {
    pub provider: Address,
    pub amount_x: i128,
    pub amount_y: i128,
    pub lp_burned: i128,
}

pub fn liquidity_removed(
    env: &Env,
    provider: &Address,
    amount_x: i128,
    amount_y: i128,
    lp_burned: i128,
) {
    let topics = (
        soroban_sdk::Symbol::new(env, "liquidity_removed"),
        env.current_contract_address(),
    );
    env.events().publish(
        topics,
        LiquidityRemovedData {
            provider: provider.clone(),
            amount_x,
            amount_y,
            lp_burned,
        },
    );
}

// ── Sync ──────────────────────────────────────────────────────────────────────

pub fn sync(env: &Env, reserve_x: i128, reserve_y: i128) {
    let topics = (
        soroban_sdk::Symbol::new(env, "sync"),
        env.current_contract_address(),
    );
    env.events().publish(topics, (reserve_x, reserve_y));
}
