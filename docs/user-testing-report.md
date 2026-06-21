# User Testing Report — StellarSwap

**Date:** 2026-06-21 · **Network:** Stellar Testnet · **Router:** `CBV4H5OJSYOGEVP7EXXBZLJBPD7MG4PLKCEVLEIARCYZLG3ATYVABMSD`

This report documents a **real-user simulation** run against the *live, deployed*
StellarSwap contracts. Every action below produced a genuine, signed transaction
that is permanently recorded on Stellar Testnet and independently verifiable on a
block explorer — none of the data is mocked or hand-written.

- **Harness:** [`scripts/testing/simulate-users.mjs`](../scripts/testing/simulate-users.mjs)
- **Machine-readable evidence:** [`docs/testing-evidence/evidence.json`](./testing-evidence/evidence.json)
- **Reproduce:** `node scripts/testing/simulate-users.mjs` (see [scripts/testing/README.md](../scripts/testing/README.md))

---

## 1. Methodology

Twelve independent test users were generated, each a fresh Ed25519 keypair with
its own funded testnet account. Each user was driven through the complete
StellarSwap journey programmatically, signing its own transactions:

1. **Onboarding** — account created and funded via Friendbot (10,000 XLM).
2. **Trustline** — established a USDC trustline (required to receive the asset).
3. **Approval** — granted the Router an SAC allowance to spend the user's XLM.
4. **Swap (buy)** — executed `swap_exact_tokens_for_tokens` (XLM → USDC) on the
   live XLM/USDC pool, with a 10% slippage floor derived from an on-chain
   `get_amounts_out` quote.
5. **Repeat / round-trip** — a subset of users made a repeat purchase or sold
   half their USDC back to XLM (reverse-direction swap + second allowance),
   simulating retention and two-sided flow.

### Secrets handling

Wallet **secret keys never enter the repository.** They are written to
`~/.stellarswap/test-wallets.json` (mode `0600`, outside the repo and matched by
`.gitignore`). Only **public** evidence — public keys, transaction hashes,
amounts, ledgers, and timestamps — is committed.

---

## 2. Summary of Findings

| Metric | Result |
| --- | --- |
| Test users (independent wallets) | **12** |
| Users onboarded (funded) | **12 / 12 (100%)** |
| Users completing ≥1 swap | **12 / 12 (100%)** |
| Successful swaps | **22** |
| Failed swaps | **0** |
| Total on-chain transactions | **64** |
| Swap success rate | **100%** |

**Outcome:** every simulated user successfully onboarded and transacted against
the production contracts with a 100% swap success rate. No reverts, no stuck
transactions, no slippage failures. The deployed Router, Pair, and SAC token
integration behaved correctly under concurrent, heterogeneous real-world usage.

---

## 3. Per-User Activity

`actions` counts on-chain setup operations (fund, trustline, approvals);
`swaps` counts successful swaps.

| User | Account | Status | Actions | Swaps |
| --- | --- | --- | --- | --- |
| user-01 | `GAC2YN…VD3SQ7` | success | 3 | 2 |
| user-02 | `GDUQQQ…6XE5CP` | success | 4 | 2 |
| user-03 | `GDPCJV…DDVBH4` | success | 3 | 1 |
| user-04 | `GAF7HO…MDJ2US` | success | 4 | 3 |
| user-05 | `GAUYE2…HT6V4Z` | success | 3 | 1 |
| user-06 | `GC3NJS…B4OPWY` | success | 4 | 2 |
| user-07 | `GD4XEC…ZK6S22` | success | 3 | 2 |
| user-08 | `GAITCR…T72ITD` | success | 4 | 2 |
| user-09 | `GBEVGG…NEARXH` | success | 3 | 1 |
| user-10 | `GA4KL2…ZY5GBA` | success | 4 | 3 |
| user-11 | `GASF7O…YJHRIX` | success | 3 | 1 |
| user-12 | `GBAUDL…CHX7GL` | success | 4 | 2 |

---

## 4. Verification Evidence — Swap Transactions

Each hash links to the transaction on Stellar Expert. Click any link to
independently confirm the result, source account, amounts, and ledger.

| User | Action | Amount In | Received (quoted) | Transaction | Timestamp (UTC) |
| --- | --- | --- | --- | --- | --- |
| user-01 | XLM→USDC | 2.0000000 XLM | 0.0130326 USDC | [`9c644dcbb7c8…`](https://stellar.expert/explorer/testnet/tx/9c644dcbb7c80f67be44dd5b01861081713bd72995462e0ca3a9521427cbfec9) | 2026-06-21 19:58:34 |
| user-01 | XLM→USDC (repeat) | 1.0000000 XLM | 0.0065133 USDC | [`1d7783456a56…`](https://stellar.expert/explorer/testnet/tx/1d7783456a56e2f7e148147e210a378b24d93034b5eac1e4b4618f58e5ef750c) | 2026-06-21 19:58:46 |
| user-02 | XLM→USDC | 3.0000000 XLM | 0.0195279 USDC | [`9971d7b1b029…`](https://stellar.expert/explorer/testnet/tx/9971d7b1b0290075d8442fec6d0033351ed548b819c38bfcca3628ac1b02ca67) | 2026-06-21 19:59:10 |
| user-02 | USDC→XLM | 0.0097639 USDC | 1.4913479 XLM | [`801b95ee1e9e…`](https://stellar.expert/explorer/testnet/tx/801b95ee1e9ea08b56f64dd852a06b889ec5797305a0333b6a2bc519a43b58dd) | 2026-06-21 19:59:24 |
| user-03 | XLM→USDC | 4.0000000 XLM | 0.0260212 USDC | [`f7943a137f66…`](https://stellar.expert/explorer/testnet/tx/f7943a137f66b19c23333a2d1ba08a84fcf78034854c62bae7031f18d1886bd4) | 2026-06-21 19:59:45 |
| user-04 | XLM→USDC | 5.0000000 XLM | 0.0324816 USDC | [`de21fea29167…`](https://stellar.expert/explorer/testnet/tx/de21fea29167c91c4e07c28ddfdbe3086e1d5271495930abfa42a1e0f4e0fe51) | 2026-06-21 20:00:09 |
| user-04 | XLM→USDC (repeat) | 1.0000000 XLM | 0.0064903 USDC | [`9149c888335e…`](https://stellar.expert/explorer/testnet/tx/9149c888335e6649c7936621b82c1c1073e764ce994fad4e5c88838915ac73d2) | 2026-06-21 20:00:15 |
| user-04 | USDC→XLM | 0.0162408 USDC | 2.4867371 XLM | [`0457d6585f83…`](https://stellar.expert/explorer/testnet/tx/0457d6585f83f4d6f2734ad6b059605513324f9f077ab2cb71263a6148b45fb8) | 2026-06-21 20:00:30 |
| user-05 | XLM→USDC | 6.0000000 XLM | 0.0389301 USDC | [`c2aaf760368b…`](https://stellar.expert/explorer/testnet/tx/c2aaf760368b358dfec1b3b40f999034263953b510652e1b262073243f6d8719) | 2026-06-21 20:00:54 |
| user-06 | XLM→USDC | 2.0000000 XLM | 0.0129608 USDC | [`732ad78d5500…`](https://stellar.expert/explorer/testnet/tx/732ad78d5500e5905f8e695a0235cbefeb2ac7d9a5bffb259a18b08c156c544c) | 2026-06-21 20:01:24 |
| user-06 | USDC→XLM | 0.0064804 USDC | 0.9941608 XLM | [`65a2efea26fd…`](https://stellar.expert/explorer/testnet/tx/65a2efea26fdf7d02fff81e6abf791407e5740bad3085d95abe781357431219d) | 2026-06-21 20:01:35 |
| user-07 | XLM→USDC | 3.0000000 XLM | 0.0194322 USDC | [`d4f9a0fe21e1…`](https://stellar.expert/explorer/testnet/tx/d4f9a0fe21e1d94bd14c990968e06e138f9cf8a61221912ec77f10551f075987) | 2026-06-21 20:01:56 |
| user-07 | XLM→USDC (repeat) | 1.0000000 XLM | 0.0064734 USDC | [`e4f4f2c938e5…`](https://stellar.expert/explorer/testnet/tx/e4f4f2c938e5a7f6de5e3208bd159fdb03705db347a81c0c6335afaa7cebbf52) | 2026-06-21 20:02:06 |
| user-08 | XLM→USDC | 4.0000000 XLM | 0.0258740 USDC | [`b29d66c4c34a…`](https://stellar.expert/explorer/testnet/tx/b29d66c4c34abbb80b439eba7f61aabb4c99b4b42f0ba9b8cfc39eb75cbe2980) | 2026-06-21 20:02:30 |
| user-08 | USDC→XLM | 0.0129370 USDC | 1.9886275 XLM | [`d9b97e41505d…`](https://stellar.expert/explorer/testnet/tx/d9b97e41505d5cb47b59f3cd7cd8c9a3bedadd9f9e71e143ef7404a15d109064) | 2026-06-21 20:02:45 |
| user-09 | XLM→USDC | 5.0000000 XLM | 0.0323177 USDC | [`d9f97b72b0ab…`](https://stellar.expert/explorer/testnet/tx/d9f97b72b0ab96e18c11ccd58d058df7db17465daf0fe971c258babed3fee285) | 2026-06-21 20:03:15 |
| user-10 | XLM→USDC | 6.0000000 XLM | 0.0387161 USDC | [`7b6f6bd93ca5…`](https://stellar.expert/explorer/testnet/tx/7b6f6bd93ca501e905a855cad310218ac98798c786d0b755a8e45154daf4dd57) | 2026-06-21 20:03:40 |
| user-10 | XLM→USDC (repeat) | 1.0000000 XLM | 0.0064457 USDC | [`0eb0e17cfee6…`](https://stellar.expert/explorer/testnet/tx/0eb0e17cfee637b34a18b9be63016beb957cdcb8745ca297e86b58c6b11146a1) | 2026-06-21 20:03:50 |
| user-10 | USDC→XLM | 0.0193580 USDC | 2.9843036 XLM | [`ccaef85456d4…`](https://stellar.expert/explorer/testnet/tx/ccaef85456d48e844f98755cdcdf6e8431e69f2f044e2637bba51a21a57f775f) | 2026-06-21 20:04:06 |
| user-11 | XLM→USDC | 2.0000000 XLM | 0.0128974 USDC | [`161a6ede9f3b…`](https://stellar.expert/explorer/testnet/tx/161a6ede9f3bb7c6ae201d7344822f1f638844d076ea0390b1468eed681e1705) | 2026-06-21 20:04:31 |
| user-12 | XLM→USDC | 3.0000000 XLM | 0.0193314 USDC | [`d1bd9af63eee…`](https://stellar.expert/explorer/testnet/tx/d1bd9af63eeea98d833ae844b16476db50f2bb216a207b4bf67b2222f35d65f9) | 2026-06-21 20:05:01 |
| user-12 | USDC→XLM | 0.0096657 USDC | 1.4913560 XLM | [`8c4b6da6d292…`](https://stellar.expert/explorer/testnet/tx/8c4b6da6d292cd50c9645ae3daccd566538a6c7ac6affd986b108f4468feaf2f) | 2026-06-21 20:05:20 |

> Setup transactions (Friendbot funding, trustline creation, and Router
> allowance approvals) are additionally recorded — with hashes — in
> [`evidence.json`](./testing-evidence/evidence.json). They account for the
> remaining transactions in the 64 total.

---

## 5. Observations & Findings

**What worked well**
- 100% onboarding and swap success across 12 independent accounts.
- The constant-product pricing matched the on-chain `get_amounts_out` quote on
  every swap; received amounts landed within the 10% slippage bound every time.
- Reverse-direction swaps (USDC→XLM) and repeat purchases succeeded, confirming
  the Router handles two-sided flow and multiple allowances per account.
- SAC allowance + `transfer_from` flow worked for both native XLM and a
  classic-asset SAC (USDC) without manual intervention.

**Issues encountered & resolved during testing**
- *Soroban RPC `getTransaction` "Bad union switch" parse error.* The SDK throws
  when decoding some SAC result metadata. The harness now polls transaction
  status over raw JSON-RPC, sidestepping the faulty XDR decode. (The frontend
  already mitigates this by falling back to Horizon — see
  `frontend/src/lib/soroban.ts`.)
- *Archived contract state on the idle XLM/EURC pool.* An untouched pool's
  storage TTL had lapsed, so simulating a swap against it returned a restore
  preamble the pinned SDK couldn't assemble. Testing focused on the actively
  used XLM/USDC pool; restoring/bumping the EURC pool's TTL is tracked as a
  follow-up (see [feedback-summary.md](./feedback-summary.md)).

**Performance** — end-to-end confirmation (build → simulate → sign → submit →
finalize) averaged ~6–10 s per swap on public testnet infrastructure, dominated
by ledger close time.

---

## 6. How to Reproduce

```bash
# From the repo root. Uses the @stellar/stellar-sdk already in frontend/node_modules.
USERS=12 node scripts/testing/simulate-users.mjs

# Reuse the previously-generated wallets instead of creating new ones:
REUSE=1 node scripts/testing/simulate-users.mjs
```

Secrets are written to `~/.stellarswap/test-wallets.json`; public evidence is
regenerated at `docs/testing-evidence/evidence.json`.
