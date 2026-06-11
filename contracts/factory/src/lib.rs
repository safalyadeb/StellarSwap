#![cfg_attr(target_family = "wasm", no_std)]
mod contract;
mod events;
mod storage;

pub use contract::FactoryContract;

#[cfg(any(test, feature = "testutils"))]
pub use contract::FactoryContractClient;
