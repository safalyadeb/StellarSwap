use soroban_sdk::{contracttype, Address, Env};

const LEDGER_BUMP: u32 = 535_000;
const LEDGER_THRESHOLD: u32 = LEDGER_BUMP / 2;

#[contracttype]
pub enum DataKey {
    Admin,
    Decimals,
    Name,
    Symbol,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address),
    AllowanceExp(Address, Address),
    Initialized,
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
