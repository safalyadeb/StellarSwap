use soroban_sdk::{contracttype, Env};

const LEDGER_BUMP: u32 = 535_000;
const LEDGER_THRESHOLD: u32 = LEDGER_BUMP / 2;

#[contracttype]
pub enum DataKey {
    Factory,
    Admin,
    Initialized,
}

pub fn extend_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
}
