use soroban_sdk::{contracttype, Address, BytesN, Env};

const LEDGER_BUMP: u32 = 535_000;
const LEDGER_THRESHOLD: u32 = LEDGER_BUMP / 2;

/// Storage key discriminants for the Factory contract.
#[contracttype]
pub enum DataKey {
    /// Address of the protocol admin (can set fee recipient).
    Admin,
    /// Optional address that receives the protocol fee (0 = no protocol fee).
    FeeTo,
    /// Address permitted to change fee_to and fee_to_setter.
    FeeToSetter,
    /// Total number of pairs ever created.
    PairCount,
    /// Pair address by 0-indexed position: PairList(index) → Address.
    PairList(u32),
    /// Canonical pair lookup: Pair(token_lo, token_hi) → Address.
    /// Tokens are always sorted lexicographically so lookup is order-independent.
    Pair(Address, Address),
    /// WASM hash of the Pair contract deployed for each new pool.
    PairWasmHash,
    /// Initialization guard — prevents double-init.
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

// ── Typed storage accessors ───────────────────────────────────────────────────

pub fn get_pair_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PairCount)
        .unwrap_or(0)
}

pub fn set_pair_count(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::PairCount, &count);
}

pub fn get_pair(env: &Env, token_a: &Address, token_b: &Address) -> Option<Address> {
    let (lo, hi) = sort(token_a.clone(), token_b.clone());
    let key = DataKey::Pair(lo, hi);
    let val = env.storage().persistent().get(&key);
    // Extend TTL on the canonical (sorted) key — not the unsorted input
    if val.is_some() {
        extend_persistent(env, &key);
    }
    val
}

pub fn set_pair(env: &Env, token_a: Address, token_b: Address, pair: Address) {
    let (lo, hi) = sort(token_a, token_b);
    let key = DataKey::Pair(lo, hi);
    env.storage().persistent().set(&key, &pair);
    extend_persistent(env, &key);
}

pub fn get_pair_at(env: &Env, index: u32) -> Option<Address> {
    let key = DataKey::PairList(index);
    let val = env.storage().persistent().get(&key);
    if val.is_some() {
        extend_persistent(env, &DataKey::PairList(index));
    }
    val
}

pub fn push_pair(env: &Env, index: u32, pair: Address) {
    let key = DataKey::PairList(index);
    env.storage().persistent().set(&key, &pair);
    extend_persistent(env, &key);
}

pub fn get_pair_wasm_hash(env: &Env) -> BytesN<32> {
    env.storage()
        .instance()
        .get(&DataKey::PairWasmHash)
        .unwrap()
}

/// Sort two token addresses into canonical (lo, hi) order.
/// Guarantees Pair(A,B) == Pair(B,A) by always using the same key.
pub fn sort(a: Address, b: Address) -> (Address, Address) {
    if a < b {
        (a, b)
    } else {
        (b, a)
    }
}
