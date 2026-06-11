# StellarSwap — Deployment Guide

**Version:** 1.0.0  
**Date:** 2026-06-02  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Environment Configuration](#3-environment-configuration)
4. [Local Development Deployment](#4-local-development-deployment)
5. [Testnet Deployment](#5-testnet-deployment)
6. [Contract Initialization Sequence](#6-contract-initialization-sequence)
7. [Liquidity Seeding](#7-liquidity-seeding)
8. [Post-Deployment Verification](#8-post-deployment-verification)
9. [Contract Upgrade Process](#9-contract-upgrade-process)
10. [Monitoring Setup](#10-monitoring-setup)
11. [Rollback Procedures](#11-rollback-procedures)
12. [Mainnet Deployment Checklist](#12-mainnet-deployment-checklist)

---

## 1. Overview

StellarSwap deploys three Soroban smart contracts to the Stellar network:

```
Deployment Order:
  1. Upload Pair WASM → get wasm_hash
  2. Deploy + init Factory (with pair_wasm_hash)
  3. Deploy + init Router (with factory_address)
  4. [Optional] Deploy test tokens (TOKEN_A, TOKEN_B)
  5. Create pools via Factory
  6. Seed liquidity via Router
```

All contract addresses are written to `config/<network>.json` for use by the SDK and frontend.

---

## 2. Prerequisites

### 2.1 Software Requirements

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none

# Stellar CLI (soroban-cli)
cargo install --locked stellar-cli --features opt

# Node.js v20+
nvm install 20

# Docker (for local development)
# Install Docker Desktop from docker.com
```

### 2.2 Verify Installation

```bash
stellar --version    # should be >= 20.x
cargo --version      # should be >= 1.75
node --version       # should be >= 20.x
docker --version
```

### 2.3 Account Setup

```bash
# Create deployment identity (keep private key safe!)
stellar keys generate deployer

# Create admin identity (for fee management)
stellar keys generate admin

# Fund on testnet via Friendbot
stellar keys fund deployer --network testnet
stellar keys fund admin --network testnet

# Verify funded
stellar keys show deployer  # shows public key
```

---

## 3. Environment Configuration

### 3.1 Network Configuration File

```bash
# Configure testnet network
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Configure local network (Stellar Quickstart Docker)
stellar network add local \
  --rpc-url http://localhost:8000/soroban/rpc \
  --network-passphrase "Standalone Network ; February 2017"
```

### 3.2 Environment Variables

```bash
# .env (never commit to git)
NETWORK=testnet                          # or 'local'
DEPLOYER_KEY=deployer                    # stellar-cli identity name
ADMIN_KEY=admin
ADMIN_ADDRESS=G...                       # admin public key

# Optional: custom RPC
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
```

### 3.3 Output Config File Template

```json
// config/testnet.json (populated by deploy scripts)
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "contracts": {
    "factory": "",
    "router": "",
    "pairWasmHash": ""
  },
  "testTokens": {
    "TOKEN_A": "",
    "TOKEN_B": "",
    "TOKEN_C": ""
  },
  "pairs": {}
}
```

---

## 4. Local Development Deployment

### 4.1 Start Local Stellar Node

```bash
# Start Stellar Quickstart + PostgreSQL
docker-compose -f infra/docker/docker-compose.yml up -d

# Wait for node to be ready (~30 seconds)
until curl -s http://localhost:8000/health | grep '"status":"healthy"'; do
  echo "Waiting for Stellar node..."
  sleep 5
done
echo "Stellar node is ready!"
```

### 4.2 Build All Contracts

```bash
# From project root
./scripts/build.sh

# Or manually:
cargo build --workspace --target wasm32v1-none --release

# Optimized WASM files are in:
# target/wasm32v1-none/release/
#   stellar_swap_factory.wasm
#   stellar_swap_pair.wasm
#   stellar_swap_router.wasm
#   stellar_swap_token.wasm
```

### 4.3 Deploy to Local Network

```bash
# Full local deployment (takes ~2 minutes)
NETWORK=local ./scripts/deploy/deploy_all.sh

# This will:
# 1. Upload all WASM files
# 2. Deploy and initialize Factory
# 3. Deploy and initialize Router
# 4. Deploy test tokens
# 5. Create test pools
# 6. Seed initial liquidity
# 7. Write to config/local.json
```

---

## 5. Testnet Deployment

### 5.1 Pre-Deployment Checklist

- [ ] All tests pass: `cargo test --workspace`
- [ ] WASM builds successfully: `cargo build --workspace --target wasm32v1-none --release`
- [ ] Deployer account funded on testnet
- [ ] Admin account funded on testnet
- [ ] `config/testnet.json` template prepared

### 5.2 Step-by-Step Testnet Deployment

#### Step 1: Build Contracts

```bash
cargo build --workspace --target wasm32v1-none --release

# Optimize WASM (reduces size)
stellar contract optimize \
  --wasm target/wasm32v1-none/release/stellar_swap_pair.wasm
# Creates: stellar_swap_pair.optimized.wasm
```

#### Step 2: Upload Pair WASM (Get Hash)

```bash
# Upload Pair WASM and get the hash (needed by Factory)
PAIR_WASM_HASH=$(stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_pair.optimized.wasm)

echo "Pair WASM Hash: $PAIR_WASM_HASH"
```

#### Step 3: Deploy Factory

```bash
FACTORY_ADDRESS=$(stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_factory.optimized.wasm)

# Initialize Factory
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $FACTORY_ADDRESS \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --fee_to_setter $ADMIN_ADDRESS \
  --pair_wasm_hash $PAIR_WASM_HASH

echo "Factory deployed at: $FACTORY_ADDRESS"
```

#### Step 4: Deploy Router

```bash
ROUTER_ADDRESS=$(stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_router.optimized.wasm)

# Initialize Router
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $ROUTER_ADDRESS \
  -- initialize \
  --factory $FACTORY_ADDRESS \
  --admin $ADMIN_ADDRESS

echo "Router deployed at: $ROUTER_ADDRESS"
```

#### Step 5: Deploy Test Tokens (Testnet Only)

```bash
# Deploy TOKEN_A
TOKEN_A_ADDRESS=$(stellar contract deploy \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_token.optimized.wasm)

stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $TOKEN_A_ADDRESS \
  -- initialize \
  --admin $ADMIN_ADDRESS \
  --decimals 7 \
  --name "Token Alpha" \
  --symbol "TLPHA"

# Mint test tokens to deployer
stellar contract invoke \
  --network testnet \
  --source admin \
  --id $TOKEN_A_ADDRESS \
  -- mint \
  --to $DEPLOYER_ADDRESS \
  --amount 1000000000000  # 100,000 tokens with 7 decimals

# Repeat for TOKEN_B, TOKEN_C
```

#### Step 6: Write Config

```bash
cat > config/testnet.json << EOF
{
  "network": "testnet",
  "rpcUrl": "https://soroban-testnet.stellar.org",
  "networkPassphrase": "Test SDF Network ; September 2015",
  "contracts": {
    "factory": "$FACTORY_ADDRESS",
    "router": "$ROUTER_ADDRESS",
    "pairWasmHash": "$PAIR_WASM_HASH"
  },
  "testTokens": {
    "TOKEN_A": "$TOKEN_A_ADDRESS",
    "TOKEN_B": "$TOKEN_B_ADDRESS",
    "TOKEN_C": "$TOKEN_C_ADDRESS"
  },
  "pairs": {}
}
EOF
```

---

## 6. Contract Initialization Sequence

### 6.1 Dependency Graph

```
PAIR_WASM (uploaded, not deployed)
    │
    └──► FACTORY (deployed, initialized with pair_wasm_hash)
              │
              └──► ROUTER (deployed, initialized with factory_address)
                       │
                       └──► POOLS (created via factory.create_pair())
                                │
                                └──► LIQUIDITY (added via router.add_liquidity())
```

### 6.2 Initialization State Machine

```
Factory States:
  UNDEPLOYED → [deploy] → DEPLOYED → [initialize()] → ACTIVE

Pair States:
  UNDEPLOYED → [factory.create_pair()] → DEPLOYED → [pair.initialize()] → ACTIVE
  Note: Factory calls initialize() during create_pair() — these are atomic.

Router States:
  UNDEPLOYED → [deploy] → DEPLOYED → [initialize()] → ACTIVE
```

### 6.3 Post-Init Validation

```bash
# Verify Factory is initialized
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $FACTORY_ADDRESS \
  -- all_pairs_length
# Expected: 0 (no pairs yet)

# Verify Router points to Factory
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $ROUTER_ADDRESS \
  -- get_factory
# Expected: $FACTORY_ADDRESS
```

---

## 7. Liquidity Seeding

### 7.1 Create Initial Pools

```bash
# Create TOKEN_A / TOKEN_B pool via Factory
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $FACTORY_ADDRESS \
  -- create_pair \
  --token_a $TOKEN_A_ADDRESS \
  --token_b $TOKEN_B_ADDRESS

# Get the new pair address
PAIR_AB=$(stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $FACTORY_ADDRESS \
  -- get_pair \
  --token_a $TOKEN_A_ADDRESS \
  --token_b $TOKEN_B_ADDRESS)

echo "Pair A/B deployed at: $PAIR_AB"
# Update config/testnet.json with pair address
```

### 7.2 Add Initial Liquidity

```bash
# Approve Router to spend tokens
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $TOKEN_A_ADDRESS \
  -- approve \
  --from $DEPLOYER_ADDRESS \
  --spender $ROUTER_ADDRESS \
  --amount 100000000000 \  # 10,000 tokens
  --expiration_ledger 999999999

# Add liquidity: 10,000 TOKEN_A + 10,000 TOKEN_B at 1:1 ratio
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $ROUTER_ADDRESS \
  -- add_liquidity \
  --caller $DEPLOYER_ADDRESS \
  --token_a $TOKEN_A_ADDRESS \
  --token_b $TOKEN_B_ADDRESS \
  --amount_a_desired 100000000000 \
  --amount_b_desired 100000000000 \
  --amount_a_min 99000000000 \
  --amount_b_min 99000000000 \
  --to $DEPLOYER_ADDRESS \
  --deadline $(($(date +%s) + 3600))
```

### 7.3 Seeding Script

For automated seeding, use the TypeScript script:

```bash
# Seed all pools with initial liquidity
npx ts-node scripts/seed/seed_liquidity.ts \
  --network testnet \
  --config config/testnet.json \
  --amount 10000  # tokens per side
```

---

## 8. Post-Deployment Verification

### 8.1 Automated Verification Script

```bash
npx ts-node scripts/verify/verify_contracts.ts --network testnet
```

This script verifies:
- Factory is deployed and initialized
- Router points to correct Factory
- Pair WASM hash matches deployed pairs
- All test pools have correct tokens
- Pool reserves match seeded liquidity
- A test swap succeeds end-to-end
- Events are queryable via Horizon

### 8.2 Manual Verification Commands

```bash
# Test swap works (small amount)
stellar contract invoke \
  --network testnet \
  --source deployer \
  --id $ROUTER_ADDRESS \
  -- swap_exact_tokens_for_tokens \
  --caller $DEPLOYER_ADDRESS \
  --amount_in 10000000 \
  --amount_out_min 1 \
  --path "[$TOKEN_A_ADDRESS, $TOKEN_B_ADDRESS]" \
  --to $DEPLOYER_ADDRESS \
  --deadline $(($(date +%s) + 300))

# Check pool reserves
stellar contract invoke \
  --network testnet \
  --id $PAIR_AB \
  -- get_reserves
# Expected: [100000000000, 100000000000] ± swap amount
```

---

## 9. Contract Upgrade Process

### 9.1 Pair Contract (NOT Upgradeable)

Pair contracts are immutable by design. If a bug is found:

1. Fix the bug in `contracts/pair/src/`
2. Build new WASM
3. Upload new WASM: get `new_pair_wasm_hash`
4. Call `factory.update_pair_wasm_hash(new_pair_wasm_hash)` [admin only]
5. **Existing pairs are unaffected** — only new pairs use the new code
6. **Communicate to users**: post migration guide, encourage LP migration to new pairs

```bash
# Upload new pair WASM
NEW_PAIR_WASM_HASH=$(stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_pair.optimized.wasm)

# Update Factory to use new pair WASM for future creates
stellar contract invoke \
  --network testnet \
  --source admin \
  --id $FACTORY_ADDRESS \
  -- update_pair_wasm_hash \
  --new_wasm_hash $NEW_PAIR_WASM_HASH
```

### 9.2 Router Upgrade

Router is upgradeable by admin. The upgrade replaces the WASM but preserves the contract address and state.

```bash
# Build new router
cargo build -p router --target wasm32v1-none --release

# Upload new WASM
NEW_ROUTER_WASM=$(stellar contract upload \
  --network testnet \
  --source deployer \
  --wasm target/wasm32v1-none/release/stellar_swap_router.optimized.wasm)

# Upgrade via admin
stellar contract invoke \
  --network testnet \
  --source admin \
  --id $ROUTER_ADDRESS \
  -- upgrade \
  --new_wasm_hash $NEW_ROUTER_WASM

echo "Router upgraded. Contract address unchanged: $ROUTER_ADDRESS"
```

### 9.3 Factory Upgrade

Factory is upgradeable by admin. Process same as Router upgrade.

**Warning**: Factory upgrade is high-risk. Plan and announce upgrades 72 hours in advance. Test on local + testnet before mainnet.

---

## 10. Monitoring Setup

### 10.1 Prometheus + Grafana

```bash
# Start monitoring stack
docker-compose -f infra/docker/docker-compose.yml \
  --profile monitoring up -d

# Grafana UI: http://localhost:3001
# Default login: admin/admin
# Import dashboard: infra/monitoring/grafana/dashboard.json
```

### 10.2 Key Metrics to Monitor

```yaml
# Indexer health metrics
stellarswap_indexer_lag_ledgers           # How far behind current ledger
stellarswap_events_processed_total        # Events processed (counter)
stellarswap_pairs_indexed_total           # Total pairs indexed

# Protocol metrics (from indexed data)
stellarswap_tvl_usd                       # Total Value Locked
stellarswap_volume_24h_usd                # 24-hour volume
stellarswap_swaps_24h_count               # Number of swaps
stellarswap_active_pairs_count            # Pairs with > 0 TVL
```

### 10.3 Alerting Rules

```yaml
# Prometheus alerting rules (infra/monitoring/alerts.yml)
groups:
  - name: stellarswap
    rules:
      - alert: IndexerLagging
        expr: stellarswap_indexer_lag_ledgers > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Indexer is lagging behind the network"

      - alert: IndexerDown
        expr: up{job="stellarswap-indexer"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Indexer service is down"
```

### 10.4 Horizon Event Monitoring

```bash
# Stream events from your contracts in real-time
curl "https://horizon-testnet.stellar.org/soroban/rpc" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getEvents",
    "params": {
      "startLedger": 1000000,
      "filters": [{"type": "contract", "contractIds": ["'"$FACTORY_ADDRESS"'"]}]
    }
  }'
```

---

## 11. Rollback Procedures

### 11.1 Rollback Scenarios

| Scenario | Impact | Rollback Action |
|----------|--------|-----------------|
| Router bug found | Medium — users must use old Router | Deploy old Router WASM via `upgrade()` |
| Factory bug found | High — new pair creation broken | Deploy old Factory WASM, redirect config |
| Pair bug found | Critical — user funds at risk | Cannot roll back; announce migration |

### 11.2 Router Rollback

```bash
# Re-deploy previous Router WASM
stellar contract invoke \
  --network testnet \
  --source admin \
  --id $ROUTER_ADDRESS \
  -- upgrade \
  --new_wasm_hash $PREVIOUS_ROUTER_WASM_HASH

# Verify old functionality restored
npx ts-node scripts/verify/verify_contracts.ts --network testnet
```

### 11.3 Emergency Pair Migration

If a critical pair bug is found (irreversible state):

1. Deploy new pair WASM, get hash
2. Update Factory's pair WASM hash
3. Deploy a migration pair at the same price (announce to community)
4. Guide LPs: remove from old pair, add to new pair
5. Maintain old pair as legacy (read-only effectively)

---

## 12. Mainnet Deployment Checklist

This checklist must be complete before ANY mainnet deployment.

### Security
- [ ] Formal security audit completed by a reputable firm
- [ ] All audit findings resolved or accepted with documented rationale
- [ ] Bug bounty program live for ≥ 30 days
- [ ] No critical or high findings outstanding
- [ ] Economic simulation tests completed

### Testing
- [ ] 100% of unit tests passing
- [ ] Integration tests passing on testnet
- [ ] Testnet live for ≥ 30 days with real usage
- [ ] Fuzz tests run for ≥ 24 hours with no failures
- [ ] Frontend manually tested across browsers

### Operations
- [ ] Monitoring and alerting configured
- [ ] Incident response playbook documented and tested
- [ ] Admin key is multisig (≥ 3-of-5)
- [ ] Upgrade timelock configured (≥ 48 hour delay)
- [ ] Deployment scripts tested end-to-end on testnet

### Documentation
- [ ] All docs updated and reviewed
- [ ] User documentation and FAQ published
- [ ] Contract addresses announced publicly
- [ ] Audit report published

### Legal / Compliance
- [ ] Terms of service reviewed
- [ ] No regulatory flags in target jurisdictions
- [ ] Token lists reviewed for compliance

---

*End of DEPLOYMENT — Version 1.0.0*
