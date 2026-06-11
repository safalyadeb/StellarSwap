#![cfg_attr(target_family = "wasm", no_std)]
mod contract;
mod events;
mod lp_token;
mod storage;

pub use contract::PairContract;

#[cfg(any(test, feature = "testutils"))]
pub use contract::PairContractClient;
