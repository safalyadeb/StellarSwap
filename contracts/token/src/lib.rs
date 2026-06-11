#![cfg_attr(target_family = "wasm", no_std)]
mod contract;
mod storage;

pub use contract::TokenContract;

#[cfg(any(test, feature = "testutils"))]
pub use contract::TokenContractClient;
