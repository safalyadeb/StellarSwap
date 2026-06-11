use soroban_sdk::{contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug)]
pub struct PairCreatedData {
    pub token_x: Address,
    pub token_y: Address,
    pub pair: Address,
    pub pair_index: u32,
}

pub fn pair_created(env: &Env, token_x: &Address, token_y: &Address, pair: &Address, index: u32) {
    let topics = (
        Symbol::new(env, "pair_created"),
        env.current_contract_address(),
    );
    env.events().publish(
        topics,
        PairCreatedData {
            token_x: token_x.clone(),
            token_y: token_y.clone(),
            pair: pair.clone(),
            pair_index: index,
        },
    );
}
