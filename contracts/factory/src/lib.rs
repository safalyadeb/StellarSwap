#![cfg_attr(target_family = "wasm", no_std)]
// events.rs uses Events::publish, which the SDK has deprecated in favour of
// the #[contractevent] macro but still fully supports. Migration is tracked
// for a later pass; allow the deprecation so CI's -D warnings stays green.
#![allow(deprecated)]
mod contract;
mod events;
mod storage;

pub use contract::FactoryContract;

#[cfg(any(test, feature = "testutils"))]
pub use contract::FactoryContractClient;
