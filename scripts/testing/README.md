# StellarSwap — Real-User Simulation Harness

A self-contained Node script that generates a cohort of independent testnet
wallets and drives each one through the full StellarSwap user journey against the
**live, deployed contracts**, producing real, verifiable on-chain activity.

It is the engine behind [`docs/user-testing-report.md`](../../docs/user-testing-report.md).

## What it does

For each generated user it:

1. Creates a fresh Ed25519 keypair.
2. Funds the account via **Friendbot** (onboarding).
3. Establishes a **USDC trustline**.
4. **Approves** the Router as an SAC spender for the user's XLM.
5. Executes real, signed **swaps** through the Router (`swap_exact_tokens_for_tokens`),
   with min-out derived from an on-chain `get_amounts_out` quote.
6. A subset of users make a **repeat purchase** or a **round-trip** (USDC→XLM).

Each step is a real transaction on Stellar Testnet, verifiable on
[Stellar Expert](https://stellar.expert/explorer/testnet).

## Usage

```bash
# from the repo root — no install step; reuses frontend/node_modules' @stellar/stellar-sdk
node scripts/testing/simulate-users.mjs

USERS=15 node scripts/testing/simulate-users.mjs   # custom cohort size (default 12)
REUSE=1  node scripts/testing/simulate-users.mjs   # reuse existing wallets instead of creating new ones
WALLET_STORE=/abs/path.json node scripts/testing/simulate-users.mjs
```

## Secrets policy

- **Secret keys are written outside the repository** to
  `~/.stellarswap/test-wallets.json` (mode `0600`), and the patterns
  `*test-wallets*.json` / `.stellarswap/` are gitignored.
- **Only public evidence** (public keys, tx hashes, amounts, ledgers, timestamps)
  is written into the repo at `docs/testing-evidence/evidence.json`.

Never commit a wallet store. Never paste a secret key (`S…`) anywhere tracked.

## Output

- `docs/testing-evidence/evidence.json` — machine-readable run record.
- Console summary — users onboarded, swaps succeeded, total on-chain txns.
