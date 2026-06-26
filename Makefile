WASM_TARGET := wasm32v1-none

build:
	cargo build --workspace --target $(WASM_TARGET) --release

test:
	cargo test --workspace

fmt:
	cargo fmt --all

lint:
	cargo clippy --workspace -- -D warnings

deploy:
	stellar contract deploy \
		--wasm target/$(WASM_TARGET)/release/stellar_swap_router.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet
	stellar contract deploy \
		--wasm target/$(WASM_TARGET)/release/stellar_swap_factory.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet
	stellar contract deploy \
		--wasm target/$(WASM_TARGET)/release/stellar_swap_pair.wasm \
		--source $(STELLAR_SECRET_KEY) \
		--network testnet

.PHONY: build test fmt lint deploy
