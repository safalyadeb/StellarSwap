use soroban_sdk::{contracttype, Address};

/// Canonical information about a liquidity pair.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PairInfo {
    pub token_x: Address,
    pub token_y: Address,
}

/// A snapshot of pool reserves at a point in time.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveSnapshot {
    pub reserve_x: i128,
    pub reserve_y: i128,
}
