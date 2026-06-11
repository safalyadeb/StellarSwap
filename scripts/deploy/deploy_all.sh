#!/usr/bin/env bash
# StellarSwap — Full Deployment Script
# Usage: NETWORK=testnet ./scripts/deploy/deploy_all.sh
set -euo pipefail

NETWORK="${NETWORK:-local}"
DEPLOYER="${DEPLOYER_KEY:-deployer}"
ADMIN="${ADMIN_KEY:-admin}"
CONFIG_FILE="config/${NETWORK}.json"

echo "=============================="
echo " StellarSwap Deployment"
echo " Network: $NETWORK"
echo "=============================="

# Step 1: Build all contracts
echo "[1/6] Building contracts..."
cargo build --workspace --target wasm32-unknown-unknown --release
echo "  ✓ Build complete"

# Step 2: Upload Pair WASM and get hash
echo "[2/6] Uploading Pair WASM..."
PAIR_WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --source "$DEPLOYER" \
  --wasm target/wasm32-unknown-unknown/release/stellar_swap_pair.wasm)
echo "  ✓ Pair WASM hash: $PAIR_WASM_HASH"

# Step 3: Deploy Factory
echo "[3/6] Deploying Factory..."
FACTORY_ADDRESS=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER" \
  --wasm target/wasm32-unknown-unknown/release/stellar_swap_factory.wasm)

ADMIN_ADDRESS=$(stellar keys address "$ADMIN")

stellar contract invoke \
  --network "$NETWORK" \
  --source "$DEPLOYER" \
  --id "$FACTORY_ADDRESS" \
  -- initialize \
  --admin "$ADMIN_ADDRESS" \
  --fee_to_setter "$ADMIN_ADDRESS" \
  --pair_wasm_hash "$PAIR_WASM_HASH"
echo "  ✓ Factory: $FACTORY_ADDRESS"

# Step 4: Deploy Router
echo "[4/6] Deploying Router..."
ROUTER_ADDRESS=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER" \
  --wasm target/wasm32-unknown-unknown/release/stellar_swap_router.wasm)

stellar contract invoke \
  --network "$NETWORK" \
  --source "$DEPLOYER" \
  --id "$ROUTER_ADDRESS" \
  -- initialize \
  --factory "$FACTORY_ADDRESS" \
  --admin "$ADMIN_ADDRESS"
echo "  ✓ Router: $ROUTER_ADDRESS"

# Step 5: Deploy test tokens (testnet/local only)
echo "[5/6] Deploying test tokens..."
DEPLOYER_ADDRESS=$(stellar keys address "$DEPLOYER")

deploy_token() {
  local NAME="$1"
  local SYMBOL="$2"
  local ADDR=$(stellar contract deploy \
    --network "$NETWORK" \
    --source "$DEPLOYER" \
    --wasm target/wasm32-unknown-unknown/release/stellar_swap_token.wasm)

  stellar contract invoke \
    --network "$NETWORK" \
    --source "$DEPLOYER" \
    --id "$ADDR" \
    -- initialize \
    --admin "$ADMIN_ADDRESS" \
    --decimals 7 \
    --name "$NAME" \
    --symbol "$SYMBOL"

  stellar contract invoke \
    --network "$NETWORK" \
    --source "$ADMIN" \
    --id "$ADDR" \
    -- mint \
    --to "$DEPLOYER_ADDRESS" \
    --amount 10000000000000  # 1,000,000 tokens

  echo "$ADDR"
}

TOKEN_A=$(deploy_token "Token Alpha" "TLPHA")
TOKEN_B=$(deploy_token "Token Beta" "TBET")
TOKEN_C=$(deploy_token "Token Gamma" "TGAM")
echo "  ✓ TOKEN_A: $TOKEN_A"
echo "  ✓ TOKEN_B: $TOKEN_B"
echo "  ✓ TOKEN_C: $TOKEN_C"

# Step 6: Write config
echo "[6/6] Writing config to $CONFIG_FILE..."
python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    cfg = json.load(f)
cfg['contracts']['factory'] = '$FACTORY_ADDRESS'
cfg['contracts']['router'] = '$ROUTER_ADDRESS'
cfg['contracts']['pairWasmHash'] = '$PAIR_WASM_HASH'
cfg['testTokens']['TOKEN_A'] = '$TOKEN_A'
cfg['testTokens']['TOKEN_B'] = '$TOKEN_B'
cfg['testTokens']['TOKEN_C'] = '$TOKEN_C'
with open('$CONFIG_FILE', 'w') as f:
    json.dump(cfg, f, indent=2)
print('Config written.')
"

echo ""
echo "=============================="
echo " Deployment Complete!"
echo " Factory: $FACTORY_ADDRESS"
echo " Router:  $ROUTER_ADDRESS"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Run: npx ts-node scripts/seed/create_pools.ts --network $NETWORK"
echo "  2. Run: npx ts-node scripts/seed/seed_liquidity.ts --network $NETWORK"
echo "  3. Run: npx ts-node scripts/verify/verify_contracts.ts --network $NETWORK"
