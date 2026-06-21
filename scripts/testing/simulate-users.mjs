#!/usr/bin/env node
/**
 * StellarSwap — Real-User Simulation Harness
 * ------------------------------------------------------------------------------
 * Generates a cohort of independent testnet wallets and drives each one through
 * the full StellarSwap user journey against the LIVE deployed contracts:
 *
 *   1. Create wallet (Ed25519 keypair)
 *   2. Fund it via Friendbot (onboarding)
 *   3. Establish trustlines for the tokens it will receive
 *   4. Approve the Router as a spender (SAC allowance)
 *   5. Execute real, signed swaps through the Router contract
 *
 * Every action produces a real, verifiable transaction hash on Stellar Testnet
 * (look any hash up on https://stellar.expert/explorer/testnet).
 *
 * SECRETS NEVER TOUCH THE REPO.
 *   - Wallet secret keys are written to  ~/.stellarswap/test-wallets.json
 *     (override with WALLET_STORE=/abs/path).
 *   - Only PUBLIC evidence (public keys, tx hashes, amounts, timestamps) is
 *     written into the repository, at docs/testing-evidence/evidence.json.
 *
 * Usage:
 *   node scripts/testing/simulate-users.mjs            # 12 users (default)
 *   USERS=15 node scripts/testing/simulate-users.mjs   # custom cohort size
 *   REUSE=1 node scripts/testing/simulate-users.mjs     # reuse existing wallets
 *
 * Requires the @stellar/stellar-sdk that already ships in frontend/node_modules.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import fs from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// Pull the SDK from the frontend's installed modules so this script needs no
// install step of its own.
const require = createRequire(join(ROOT, 'frontend', 'package.json'));
const StellarSdk = require('@stellar/stellar-sdk');
const {
  Keypair,
  rpc,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
  Asset,
  Operation,
  Horizon,
} = StellarSdk;

// ── Config ────────────────────────────────────────────────────────────────────
const cfg = JSON.parse(fs.readFileSync(join(ROOT, 'config', 'testnet.json'), 'utf8'));
const RPC_URL = cfg.rpcUrl;
const HORIZON_URL = cfg.horizonUrl;
const PASSPHRASE = cfg.networkPassphrase;
const ROUTER = cfg.contracts.router;
const XLM = cfg.tokens.XLM;
const USDC = cfg.tokens.USDC;
const EURC = cfg.tokens.EURC;
const FRIENDBOT = 'https://friendbot.stellar.org';

const USERS = Number(process.env.USERS || 12);
const REUSE = process.env.REUSE === '1';
const WALLET_STORE =
  process.env.WALLET_STORE || join(homedir(), '.stellarswap', 'test-wallets.json');
const EVIDENCE_DIR = join(ROOT, 'docs', 'testing-evidence');
const EVIDENCE_FILE = join(EVIDENCE_DIR, 'evidence.json');

const server = new rpc.Server(RPC_URL, { allowHttp: true });
const horizon = new Horizon.Server(HORIZON_URL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const stroops = (n) => BigInt(Math.round(n * 1e7));
const toXlm = (s) => (Number(s) / 1e7).toFixed(7);

// ── Wallet store (secrets stay OUTSIDE the repo) ────────────────────────────────
function loadOrCreateWallets(n) {
  let wallets = [];
  if (REUSE && fs.existsSync(WALLET_STORE)) {
    wallets = JSON.parse(fs.readFileSync(WALLET_STORE, 'utf8')).wallets;
    log(`↻ Reusing ${wallets.length} wallets from ${WALLET_STORE}`);
    return wallets.slice(0, n);
  }
  for (let i = 0; i < n; i++) {
    const kp = Keypair.random();
    wallets.push({ id: `user-${String(i + 1).padStart(2, '0')}`, publicKey: kp.publicKey(), secret: kp.secret() });
  }
  fs.mkdirSync(dirname(WALLET_STORE), { recursive: true });
  fs.writeFileSync(WALLET_STORE, JSON.stringify({ network: 'testnet', createdAt: new Date().toISOString(), wallets }, null, 2), { mode: 0o600 });
  log(`🔐 Wrote ${n} wallet secrets to ${WALLET_STORE} (chmod 600, never committed)`);
  return wallets;
}

// ── Generic helpers ─────────────────────────────────────────────────────────────
async function fundWithFriendbot(publicKey) {
  const res = await fetch(`${FRIENDBOT}/?addr=${encodeURIComponent(publicKey)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body.successful && !(body.detail || '').includes('createAccountAlreadyExist')) {
    // already-funded is fine; anything else is an error
    if (!(body.status === 400 && /op_already_exists|already funded/i.test(JSON.stringify(body)))) {
      throw new Error(`friendbot failed: ${JSON.stringify(body).slice(0, 200)}`);
    }
  }
  return body.hash || 'funded';
}

async function changeTrust(kp, asset, code) {
  const account = await horizon.loadAccount(kp.publicKey());
  const already = account.balances.some(
    (b) => b.asset_type !== 'native' && b.asset_code === code && b.asset_issuer === asset.getIssuer(),
  );
  if (already) return 'exists';
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const res = await horizon.submitTransaction(tx);
  return res.hash;
}

/** Build → simulate → assemble → sign(kp) → submit → poll a Soroban invocation. */
async function invoke(kp, contractId, method, args) {
  const source = await server.getAccount(kp.publicKey());
  const contract = new Contract(contractId);
  const built = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(contract.call(method, ...args))
    .setTimeout(120)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`simulate ${method}: ${sim.error}`);

  const prepared = rpc.assembleTransaction(built, sim).build();
  prepared.sign(kp);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') {
    let detail = sent.status;
    try {
      detail = sent.errorResult?.toXDR ? sent.errorResult.toXDR('base64') : String(sent.errorResult);
    } catch {
      /* xdr can be unparseable */
    }
    throw new Error(`send ${method} rejected: ${detail}`);
  }

  // Poll via raw JSON-RPC: the SDK's getTransaction throws "Bad union switch"
  // parsing some SAC result metas, so we read status directly off the wire.
  const hash = sent.hash;
  for (let i = 0; i < 40; i++) {
    await sleep(1500);
    const status = await rawTxStatus(hash);
    if (status.status === 'SUCCESS') return { hash, ledger: status.ledger };
    if (status.status === 'FAILED') throw new Error(`${method} failed on-chain (${hash})`);
  }
  throw new Error(`${method} timed out (${hash})`);
}

async function rawTxStatus(hash) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash } }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: json.result?.status || 'NOT_FOUND', ledger: json.result?.ledger };
}

async function currentLedger() {
  return (await server.getLatestLedger()).sequence;
}

async function approveRouter(kp, tokenSac, amount) {
  const ledger = await currentLedger();
  return invoke(kp, tokenSac, 'approve', [
    new Address(kp.publicKey()).toScVal(),
    new Address(ROUTER).toScVal(),
    nativeToScVal(amount, { type: 'i128' }),
    nativeToScVal(ledger + 500_000, { type: 'u32' }),
  ]);
}

async function swapExactIn(kp, amountIn, tokenIn, tokenOut, minOut) {
  const deadline = Math.floor(Date.now() / 1000) + 600;
  return invoke(kp, ROUTER, 'swap_exact_tokens_for_tokens', [
    new Address(kp.publicKey()).toScVal(),
    nativeToScVal(amountIn, { type: 'i128' }),
    nativeToScVal(minOut, { type: 'i128' }),
    xdr.ScVal.scvVec([new Address(tokenIn).toScVal(), new Address(tokenOut).toScVal()]),
    new Address(kp.publicKey()).toScVal(),
    nativeToScVal(BigInt(deadline), { type: 'u64' }),
  ]);
}

/** Read-only quote via the Router's get_amounts_out view. */
async function quote(amountIn, path) {
  const source = await server.getAccount(cfg.deployer);
  const contract = new Contract(ROUTER);
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      contract.call(
        'get_amounts_out',
        nativeToScVal(amountIn, { type: 'i128' }),
        xdr.ScVal.scvVec(path.map((t) => new Address(t).toScVal())),
      ),
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return [amountIn, 0n];
  return scValToNative(sim.result.retval).map((x) => BigInt(x));
}

// ── Per-user journey ────────────────────────────────────────────────────────────
async function runUser(w, idx) {
  const kp = Keypair.fromSecret(w.secret);
  const record = {
    id: w.id,
    publicKey: w.publicKey,
    actions: [],
    swaps: [],
    status: 'pending',
  };
  const stamp = () => new Date().toISOString();
  const note = (action, result, hash) => record.actions.push({ action, result, hash, timestamp: stamp() });

  // Execute a single exact-in swap and record evidence; isolates failures so
  // one bad swap doesn't wipe out a user's other verified activity.
  async function doSwap(label, amountInStroops, tokenIn, tokenOut, inSym, outSym) {
    try {
      const amounts = await quote(amountInStroops, [tokenIn, tokenOut]);
      const expectedOut = amounts[amounts.length - 1] ?? 0n;
      if (expectedOut <= 0n) throw new Error('quote returned zero output (insufficient liquidity)');
      const minOut = expectedOut > 10n ? (expectedOut * 90n) / 100n : 1n; // 10% slippage, floor 1
      const r = await swapExactIn(kp, amountInStroops, tokenIn, tokenOut, minOut);
      record.swaps.push({
        label,
        amountIn: `${toXlm(amountInStroops)} ${inSym}`,
        expectedOut: `${toXlm(expectedOut)} ${outSym}`,
        minOut: `${toXlm(minOut)} ${outSym}`,
        txHash: r.hash,
        ledger: r.ledger,
        timestamp: stamp(),
        status: 'SUCCESS',
        explorer: `https://stellar.expert/explorer/testnet/tx/${r.hash}`,
      });
      log(`  ✅ ${w.id} ${label}: ${toXlm(amountInStroops)} ${inSym} → ~${toXlm(expectedOut)} ${outSym}  tx=${r.hash.slice(0, 10)}…`);
      await sleep(800);
      return expectedOut;
    } catch (e) {
      record.swaps.push({ label, status: 'FAILED', error: String(e?.message || e), timestamp: stamp() });
      log(`  ⚠️  ${w.id} ${label} failed: ${String(e?.message || e).slice(0, 80)}`);
      return 0n;
    }
  }

  try {
    // 1) Onboarding — fund
    const fundHash = await fundWithFriendbot(w.publicKey);
    note('fund_via_friendbot', 'success', fundHash);
    await sleep(1200);

    // 2) Trustline for USDC (the token every user receives)
    note('trustline_USDC', 'success', await changeTrust(kp, new Asset('USDC', USDC.issuer), 'USDC'));

    // 3) Approve Router to spend this user's XLM (SAC allowance)
    note('approve_router_XLM', 'success', (await approveRouter(kp, XLM.sac, stroops(5000))).hash);

    // 4) Primary swap: XLM → USDC. Amount varies per user (2..6 XLM).
    const buyAmount = 2 + (idx % 5);
    const usdcOut = await doSwap('XLM→USDC', stroops(buyAmount), XLM.sac, USDC.sac, 'XLM', 'USDC');

    // 5) Power users (every 3rd) make a repeat purchase to show retention.
    if (idx % 3 === 0) {
      await doSwap('XLM→USDC (repeat)', stroops(1), XLM.sac, USDC.sac, 'XLM', 'USDC');
    }

    // 6) Round-trip users (every 2nd) sell part of their USDC back to XLM,
    //    exercising the reverse swap direction and a second SAC allowance.
    if (idx % 2 === 1 && usdcOut > 100n) {
      const sellAmt = usdcOut / 2n;
      note('approve_router_USDC', 'success', (await approveRouter(kp, USDC.sac, sellAmt * 4n)).hash);
      await doSwap('USDC→XLM', sellAmt, USDC.sac, XLM.sac, 'USDC', 'XLM');
    }

    record.status = record.swaps.some((s) => s.status === 'SUCCESS') ? 'success' : 'error';
  } catch (e) {
    record.status = 'error';
    record.error = String(e?.message || e);
    log(`  ❌ ${w.id} failed: ${record.error}`);
  }
  return record;
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  log(`\nStellarSwap real-user simulation — ${USERS} users on Stellar Testnet`);
  log(`Router: ${ROUTER}\n`);

  const wallets = loadOrCreateWallets(USERS);
  const results = [];
  for (let i = 0; i < wallets.length; i++) {
    log(`▶ ${wallets[i].id} (${wallets[i].publicKey.slice(0, 6)}…${wallets[i].publicKey.slice(-4)})`);
    results.push(await runUser(wallets[i], i));
  }

  const swapsOk = results.reduce((n, r) => n + r.swaps.filter((s) => s.status === 'SUCCESS').length, 0);
  const usersOk = results.filter((r) => r.status === 'success').length;
  const summary = {
    network: 'testnet',
    generatedAt: new Date().toISOString(),
    router: ROUTER,
    cohortSize: wallets.length,
    usersOnboarded: results.filter((r) => r.actions.some((a) => a.action === 'fund_via_friendbot')).length,
    usersFullyCompleted: usersOk,
    totalSwaps: swapsOk,
    totalOnChainTxns: results.reduce(
      (n, r) => n + r.actions.filter((a) => a.hash && a.hash.length === 64).length + r.swaps.length,
      0,
    ),
    results,
  };

  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(EVIDENCE_FILE, JSON.stringify(summary, null, 2));
  log(`\n📄 Evidence written to ${EVIDENCE_FILE}`);
  log(`   Users onboarded: ${summary.usersOnboarded}/${wallets.length}`);
  log(`   Users fully completed journey: ${usersOk}/${wallets.length}`);
  log(`   Successful swaps: ${swapsOk}`);
  log(`   Total on-chain transactions: ${summary.totalOnChainTxns}\n`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
