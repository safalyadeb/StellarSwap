use soroban_sdk::{contracttype, Address, Env};

const LEDGER_BUMP: u32 = 535_000;
const LEDGER_THRESHOLD: u32 = LEDGER_BUMP / 2;

/// Storage key discriminants for the Pair contract.
#[contracttype]
pub enum DataKey {
    // ── Instance storage (low read cost, accessed every call) ────────────
    /// Address of token X (the lexicographically smaller token).
    TokenX,
    /// Address of token Y (the lexicographically larger token).
    TokenY,
    /// Current reserve of token X held by this pool.
    ReserveX,
    /// Current reserve of token Y held by this pool.
    ReserveY,
    /// Total LP tokens in circulation (including burned minimum liquidity).
    TotalSupply,
    /// k = reserve_x * reserve_y, stored before fee calculation for protocol fee.
    KLast,
    /// Address of the Factory that created this pair.
    Factory,
    /// Initialization guard — prevents double-init.
    Initialized,

    // ── Persistent storage (per-user, bump on access) ────────────────────
    /// LP token balance for an individual address.
    LpBalance(Address),
    /// LP token spending allowance: (owner, spender) → amount.
    LpAllowance(Address, Address),
    /// Allowance expiration ledger: (owner, spender) → expiration_ledger.
    LpAllowanceExp(Address, Address),
}

pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
}

pub fn extend_persistent(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, LEDGER_THRESHOLD, LEDGER_BUMP);
}

// ── Typed storage accessors ───────────────────────────────────────────────────

pub fn get_reserves(env: &Env) -> (i128, i128) {
    let rx = env
        .storage()
        .instance()
        .get(&DataKey::ReserveX)
        .unwrap_or(0i128);
    let ry = env
        .storage()
        .instance()
        .get(&DataKey::ReserveY)
        .unwrap_or(0i128);
    (rx, ry)
}

pub fn set_reserves(env: &Env, reserve_x: i128, reserve_y: i128) {
    env.storage().instance().set(&DataKey::ReserveX, &reserve_x);
    env.storage().instance().set(&DataKey::ReserveY, &reserve_y);
}

pub fn get_total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0i128)
}

pub fn set_total_supply(env: &Env, supply: i128) {
    env.storage().instance().set(&DataKey::TotalSupply, &supply);
}

pub fn get_lp_balance(env: &Env, account: &Address) -> i128 {
    let key = DataKey::LpBalance(account.clone());
    let bal = env.storage().persistent().get(&key).unwrap_or(0i128);
    if bal > 0 {
        extend_persistent(env, &key);
    }
    bal
}

pub fn set_lp_balance(env: &Env, account: &Address, amount: i128) {
    let key = DataKey::LpBalance(account.clone());
    env.storage().persistent().set(&key, &amount);
    extend_persistent(env, &key);
}

pub fn get_lp_allowance(env: &Env, owner: &Address, spender: &Address) -> (i128, u32) {
    let exp_key = DataKey::LpAllowanceExp(owner.clone(), spender.clone());
    let exp: u32 = env.storage().persistent().get(&exp_key).unwrap_or(0);
    let key = DataKey::LpAllowance(owner.clone(), spender.clone());
    let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    (amount, exp)
}

pub fn set_lp_allowance(env: &Env, owner: &Address, spender: &Address, amount: i128, exp: u32) {
    let key = DataKey::LpAllowance(owner.clone(), spender.clone());
    let exp_key = DataKey::LpAllowanceExp(owner.clone(), spender.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage().persistent().set(&exp_key, &exp);
    extend_persistent(env, &key);
    extend_persistent(env, &exp_key);
}
