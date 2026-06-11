#!/usr/bin/env bash
# StellarSwap — Real Token Deployment Script (Testnet)
#
# Uses real Stellar Asset Contracts (SAC) for XLM, USDC, EURC.
# Creates a new EURC issuer keypair since testnet has no active EURC supply.
#
# Prerequisites:
#   - stellar-cli >= 23.4.1
#   - Stellar identity with XLM and USDC (stellax-deployer)
#   - cargo + wasm32v1-none target installed
#
# Usage: DEPLOYER_KEY=stellax-deployer ./scripts/deploy/deploy_real_tokens.sh

set -euo pipefail

DEPLOYER_KEY="${DEPLOYER_KEY:-stellax-deployer}"
NETWORK="${NETWORK:-testnet}"
DEPLOYER_ADDR=$(stellar keys address "$DEPLOYER_KEY")

echo "======================================================"
echo " StellarSwap Real Token Deployment"
echo " Network:  $NETWORK"
echo " Deployer: $DEPLOYER_ADDR"
echo "======================================================"
echo ""

# ── 1. Real SAC addresses ──────────────────────────────────────────────────────

XLM_SAC="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
USDC_SAC="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

echo "[1/6] Using real SAC addresses:"
echo "  XLM:  $XLM_SAC  (native, Stellar Lumens)"
echo "  USDC: $USDC_SAC (Circle testnet USDC)"

# ── 2. Create EURC issuer if needed ───────────────────────────────────────────

if ! stellar keys ls | grep -q "eurc-issuer-testnet"; then
  echo ""
  echo "[2/6] Creating EURC issuer keypair..."
  stellar keys generate eurc-issuer-testnet
  EURC_ISSUER_ADDR=$(stellar keys address eurc-issuer-testnet)
  curl -s "https://friendbot.stellar.org/?addr=$EURC_ISSUER_ADDR" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  ✓ Funded EURC issuer' if 'hash' in d else d)"
else
  echo "[2/6] Using existing EURC issuer."
fi

EURC_ISSUER_ADDR=$(stellar keys address eurc-issuer-testnet)

# Create trustline if not existing
echo "  Creating trustline deployer → EURC issuer..."
XDR=$(stellar tx new change-trust \
  --line "EURC:$EURC_ISSUER_ADDR" \
  --source-account "$DEPLOYER_KEY" \
  --network "$NETWORK" \
  --build-only 2>/dev/null)
SIGNED=$(echo "$XDR" | stellar tx sign --network "$NETWORK" --sign-with-key "$DEPLOYER_KEY" 2>/dev/null)
echo "$SIGNED" | stellar tx send --network "$NETWORK" 2>&1 | grep -E "status|already|error" | head -1 || true

# Issue EURC to deployer (5000 EURC = 50,000,000,000 stroops)
echo "  Issuing 5000 EURC to deployer..."
XDR=$(stellar tx new payment \
  --asset "EURC:$EURC_ISSUER_ADDR" \
  --amount 50000000000 \
  --destination "$DEPLOYER_ADDR" \
  --source-account eurc-issuer-testnet \
  --network "$NETWORK" \
  --build-only 2>/dev/null)
SIGNED=$(echo "$XDR" | stellar tx sign --network "$NETWORK" --sign-with-key eurc-issuer-testnet 2>/dev/null)
echo "$SIGNED" | stellar tx send --network "$NETWORK" 2>&1 | grep -E '"status"' | head -1

# Deploy EURC SAC
echo "  Deploying EURC SAC..."
EURC_SAC=$(stellar contract asset deploy \
  --asset "EURC:$EURC_ISSUER_ADDR" \
  --source "$DEPLOYER_KEY" \
  --network "$NETWORK" 2>&1 | tail -1)
echo "  EURC SAC: $EURC_SAC"

# ── 3. Build contracts ─────────────────────────────────────────────────────────

echo ""
echo "[3/6] Building contracts..."
cargo build \
  --package stellar-swap-factory \
  --package stellar-swap-pair \
  --package stellar-swap-router \
  --target wasm32v1-none \
  --release 2>&1 | tail -3

# ── 4. Deploy Factory ──────────────────────────────────────────────────────────

echo ""
echo "[4/6] Deploying Factory..."

PAIR_WASM_HASH=$(stellar contract upload \
  --network "$NETWORK" \
  --source "$DEPLOYER_KEY" \
  --wasm target/wasm32v1-none/release/stellar_swap_pair.wasm 2>&1 | tail -1)
echo "  Pair WASM hash: $PAIR_WASM_HASH"

FACTORY=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER_KEY" \
  --wasm target/wasm32v1-none/release/stellar_swap_factory.wasm \
  2>&1 | grep -v "^ℹ️\|^🌎\|^Simul\|^Sign" | tail -1)
echo "  Factory: $FACTORY"

stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$FACTORY" -- initialize \
  --admin "$DEPLOYER_ADDR" \
  --fee_to_setter "$DEPLOYER_ADDR" \
  --pair_wasm_hash "$PAIR_WASM_HASH" \
  2>&1 | grep -v "^ℹ️\|^🌎"

# ── 5. Deploy Router ───────────────────────────────────────────────────────────

echo ""
echo "[5/6] Deploying Router..."

ROUTER=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$DEPLOYER_KEY" \
  --wasm target/wasm32v1-none/release/stellar_swap_router.wasm \
  2>&1 | grep -v "^ℹ️\|^🌎\|^Simul\|^Sign" | tail -1)
echo "  Router: $ROUTER"

stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$ROUTER" -- initialize \
  --factory "$FACTORY" \
  --admin "$DEPLOYER_ADDR" \
  2>&1 | grep -v "^ℹ️\|^🌎"

# ── 6. Create pools and seed liquidity ───────────────────────────────────────

echo ""
echo "[6/6] Creating pools and seeding liquidity..."

# Approve Router
CURRENT_LEDGER=$(curl -s "https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d['_embedded']['records'][0]['sequence'])")
EXPIRY=$((CURRENT_LEDGER + 1000000))

for SAC in "$XLM_SAC" "$USDC_SAC" "$EURC_SAC"; do
  stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
    --id "$SAC" -- approve \
    --from "$DEPLOYER_ADDR" --spender "$ROUTER" \
    --amount 100000000000 --expiration_ledger "$EXPIRY" \
    2>&1 | grep -v "^ℹ️\|^🌎" | grep -E "Success|error" | head -1
done

DEADLINE=$(( $(date +%s) + 3600 ))

# XLM/USDC: 52.5 XLM + 5 USDC (price ~$0.095/XLM)
stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$FACTORY" -- create_pair --token_a "$XLM_SAC" --token_b "$USDC_SAC" \
  2>&1 | grep '"C' | tr -d '"' | head -1

PAIR_XU=$(stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$FACTORY" -- get_pair --token_a "$XLM_SAC" --token_b "$USDC_SAC" \
  2>&1 | grep '"C' | tr -d '"')

stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$ROUTER" -- add_liquidity \
  --caller "$DEPLOYER_ADDR" --token_a "$XLM_SAC" --token_b "$USDC_SAC" \
  --amount_a_desired 525000000 --amount_b_desired 50000000 \
  --amount_a_min 0 --amount_b_min 0 \
  --to "$DEPLOYER_ADDR" --deadline "$DEADLINE" \
  2>&1 | grep "lp_minted" | head -1

echo "  XLM/USDC pair seeded: $PAIR_XU"

# XLM/EURC: 57.75 XLM + 5 EURC (price ~$0.095/XLM at EUR≈$1.10)
stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$FACTORY" -- create_pair --token_a "$XLM_SAC" --token_b "$EURC_SAC" \
  2>&1 | grep '"C' | tr -d '"' | head -1

PAIR_XE=$(stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$FACTORY" -- get_pair --token_a "$XLM_SAC" --token_b "$EURC_SAC" \
  2>&1 | grep '"C' | tr -d '"')

stellar contract invoke --network "$NETWORK" --source "$DEPLOYER_KEY" \
  --id "$ROUTER" -- add_liquidity \
  --caller "$DEPLOYER_ADDR" --token_a "$XLM_SAC" --token_b "$EURC_SAC" \
  --amount_a_desired 577500000 --amount_b_desired 50000000 \
  --amount_a_min 0 --amount_b_min 0 \
  --to "$DEPLOYER_ADDR" --deadline "$DEADLINE" \
  2>&1 | grep "lp_minted" | head -1

echo "  XLM/EURC pair seeded: $PAIR_XE"

# ── Write config ───────────────────────────────────────────────────────────────

python3 -c "
import json
config = {
  'network': '$NETWORK',
  'rpcUrl': 'https://soroban-testnet.stellar.org',
  'networkPassphrase': 'Test SDF Network ; September 2015',
  'horizonUrl': 'https://horizon-testnet.stellar.org',
  'deployer': '$DEPLOYER_ADDR',
  'contracts': {
    'factory': '$FACTORY',
    'router': '$ROUTER',
    'pairWasmHash': '$PAIR_WASM_HASH'
  },
  'tokens': {
    'XLM':  {'sac': '$XLM_SAC',  'symbol': 'XLM',  'name': 'Stellar Lumens', 'issuer': None},
    'USDC': {'sac': '$USDC_SAC', 'symbol': 'USDC', 'name': 'USD Coin (Circle)', 'issuer': '$USDC_ISSUER'},
    'EURC': {'sac': '$EURC_SAC', 'symbol': 'EURC', 'name': 'Euro Coin', 'issuer': '$EURC_ISSUER_ADDR'}
  },
  'pairs': {
    'XLM/USDC': {'address': '$PAIR_XU'},
    'XLM/EURC': {'address': '$PAIR_XE'}
  }
}
with open('config/testnet.json', 'w') as f:
    json.dump(config, f, indent=2)
print('Config written to config/testnet.json')
"

echo ""
echo "======================================================"
echo " Deployment complete!"
echo " Factory: $FACTORY"
echo " Router:  $ROUTER"
echo " XLM/USDC pair: $PAIR_XU"
echo " XLM/EURC pair: $PAIR_XE"
echo "======================================================"
