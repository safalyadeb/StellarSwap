//! Soroban transaction layer.
//! Builds, simulates, signs (Freighter), and submits transactions, plus
//! read-only queries (reserves, balances, allowances, LP positions).

import {
  Contract,
  rpc,
  Transaction,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  Address,
  scValToNative,
  xdr,
  Asset,
  Operation,
  Horizon,
} from '@stellar/stellar-sdk';
import { signWithWallet } from './wallet';
import { STELLAR_RPC_URL, STELLAR_HORIZON_URL, NETWORK_PASSPHRASE, CONTRACTS, READ_ACCOUNT } from './constants';

export const server = new rpc.Server(STELLAR_RPC_URL, { allowHttp: true });
const horizonServer = new Horizon.Server(STELLAR_HORIZON_URL);

// ── Read-only simulation ──────────────────────────────────────────────────────

/**
 * Simulate a read-only contract call and return the decoded native result.
 * Uses READ_ACCOUNT as the source (no signature needed for simulation).
 */
async function simRead<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  source = READ_ACCOUNT,
): Promise<T | null> {
  try {
    const account = await server.getAccount(source);
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim) || !sim.result) return null;
    return scValToNative(sim.result.retval) as T;
  } catch {
    return null;
  }
}

// ── Write path: build → simulate → sign → submit ───────────────────────────────

async function buildAndSubmit(
  publicKey: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  onProgress?: (msg: string) => void,
): Promise<string> {
  const account = await server.getAccount(publicKey);
  const contract = new Contract(contractId);

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(humanizeError(sim.error));
  }

  const prepared = rpc.assembleTransaction(built, sim).build();

  onProgress?.('Confirm in your Freighter wallet…');
  const signedXdr = await signWithWallet(prepared.toXDR(), NETWORK_PASSPHRASE, publicKey);

  onProgress?.('Processing transaction on blockchain…');
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  const sent = await server.sendTransaction(signedTx);

  if (sent.status === 'ERROR') {
    throw new Error('Transaction submission failed');
  }

  // Poll for confirmation. Soroban RPC can throw "Bad union switch" when parsing
  // the result XDR for certain transaction types — fall back to Horizon in that case.
  const hash = sent.hash;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const res = await server.getTransaction(hash);
      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return hash;
      if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed on-chain (${hash.slice(0, 8)}…)`);
      }
    } catch (e: any) {
      if (typeof e?.message === 'string' && e.message.includes('Bad union switch')) {
        // XDR parse error in Soroban RPC client — verify via Horizon instead
        try {
          const tx = await horizonServer.transactions().transaction(hash).call();
          if (tx.successful) return hash;
          throw new Error(`Transaction failed on-chain (${hash.slice(0, 8)}…)`);
        } catch (herr: any) {
          if (herr?.message?.includes('on-chain')) throw herr;
          // Horizon lookup also failed; transaction may still be pending — keep polling
        }
      } else {
        throw e;
      }
    }
  }
  throw new Error('Timed out waiting for confirmation');
}

function humanizeError(raw: string): string {
  if (raw.includes('#13') || raw.includes('TrustlineMissing')) return 'Your wallet is missing a trustline for the output token. Please approve the trustline setup in your wallet and try again.';
  if (raw.includes('#201') || raw.includes('InsufficientOutput')) return 'Price moved — slippage exceeded. Try again or raise tolerance.';
  if (raw.includes('#300') || raw.includes('Expired')) return 'Transaction deadline expired.';
  if (raw.includes('#202') || raw.includes('InsufficientLiquidity')) return 'Not enough liquidity in the pool.';
  if (raw.includes('InsufficientBalance') || raw.includes('#500')) return 'Insufficient token balance.';
  return raw.length > 140 ? raw.slice(0, 140) + '…' : raw;
}

// ── Read API ────────────────────────────────────────────────────────────────

/** Pool reserves [reserve_x, reserve_y]. */
export async function getReserves(pairAddress: string): Promise<[bigint, bigint]> {
  const r = await simRead<[string | number, string | number]>(pairAddress, 'get_reserves');
  if (!r) return [0n, 0n];
  return [BigInt(r[0]), BigInt(r[1])];
}

/** SAC token balance for an account (in stroops). */
export async function getTokenBalance(publicKey: string, tokenSac: string): Promise<bigint> {
  const r = await simRead<string | number>(tokenSac, 'balance', [new Address(publicKey).toScVal()], publicKey);
  return r != null ? BigInt(r) : 0n;
}

/** LP token balance for an account in a given pair. */
export async function getLpBalance(publicKey: string, pairAddress: string): Promise<bigint> {
  const r = await simRead<string | number>(pairAddress, 'lp_balance', [new Address(publicKey).toScVal()], publicKey);
  return r != null ? BigInt(r) : 0n;
}

/** Total LP supply of a pair. */
export async function getLpTotalSupply(pairAddress: string): Promise<bigint> {
  const r = await simRead<string | number>(pairAddress, 'lp_total_supply');
  return r != null ? BigInt(r) : 0n;
}

/** Current allowance the Router has on a token for a given owner. */
export async function getAllowance(publicKey: string, tokenSac: string): Promise<bigint> {
  const r = await simRead<string | number>(
    tokenSac,
    'allowance',
    [new Address(publicKey).toScVal(), new Address(CONTRACTS.router).toScVal()],
    publicKey,
  );
  return r != null ? BigInt(r) : 0n;
}

export async function getCurrentLedger(): Promise<number> {
  const latest = await server.getLatestLedger();
  return latest.sequence;
}

// ── Write API ─────────────────────────────────────────────────────────────────

/**
 * Ensure the user's Stellar account has a trustline for a classic asset.
 * If missing, submits a changeTrust operation signed via Freighter.
 * No-op for native XLM (issuer is null).
 */
export async function ensureTrustline(
  publicKey: string,
  assetCode: string,
  issuer: string,
): Promise<void> {
  const account = await horizonServer.loadAccount(publicKey);
  const hasTrustline = account.balances.some(
    (b: any) => b.asset_type !== 'native' && b.asset_code === assetCode && b.asset_issuer === issuer,
  );
  if (hasTrustline) return;

  const asset = new Asset(assetCode, issuer);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();

  const signedXdr = await signWithWallet(
    tx.toXDR(),
    NETWORK_PASSPHRASE,
    publicKey,
    'Trustline setup rejected in wallet',
  );

  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  await horizonServer.submitTransaction(signedTx);
}

async function ensureAllowance(
  publicKey: string,
  token: string,
  needed: bigint,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const current = await getAllowance(publicKey, token);
  if (current >= needed) return;
  onProgress?.('Approving token spend…');
  const ledger = await getCurrentLedger();
  await buildAndSubmit(publicKey, token, 'approve', [
    new Address(publicKey).toScVal(),
    new Address(CONTRACTS.router).toScVal(),
    nativeToScVal(needed * 100n, { type: 'i128' }), // generous allowance to avoid re-approving
    nativeToScVal(ledger + 500_000, { type: 'u32' }),
  ], onProgress);
}

export async function swapExactIn(p: {
  publicKey: string;
  amountIn: bigint;
  amountOutMin: bigint;
  tokenIn: string;
  tokenOut: string;
  deadline: number;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  await ensureAllowance(p.publicKey, p.tokenIn, p.amountIn, p.onProgress);
  return buildAndSubmit(p.publicKey, CONTRACTS.router, 'swap_exact_tokens_for_tokens', [
    new Address(p.publicKey).toScVal(),
    nativeToScVal(p.amountIn, { type: 'i128' }),
    nativeToScVal(p.amountOutMin, { type: 'i128' }),
    xdr.ScVal.scvVec([new Address(p.tokenIn).toScVal(), new Address(p.tokenOut).toScVal()]),
    new Address(p.publicKey).toScVal(),
    nativeToScVal(BigInt(p.deadline), { type: 'u64' }),
  ], p.onProgress);
}

export async function swapExactOut(p: {
  publicKey: string;
  amountOut: bigint;
  amountInMax: bigint;
  tokenIn: string;
  tokenOut: string;
  deadline: number;
  onProgress?: (msg: string) => void;
}): Promise<string> {
  await ensureAllowance(p.publicKey, p.tokenIn, p.amountInMax, p.onProgress);
  return buildAndSubmit(p.publicKey, CONTRACTS.router, 'swap_tokens_for_exact_tokens', [
    new Address(p.publicKey).toScVal(),
    nativeToScVal(p.amountOut, { type: 'i128' }),
    nativeToScVal(p.amountInMax, { type: 'i128' }),
    xdr.ScVal.scvVec([new Address(p.tokenIn).toScVal(), new Address(p.tokenOut).toScVal()]),
    new Address(p.publicKey).toScVal(),
    nativeToScVal(BigInt(p.deadline), { type: 'u64' }),
  ], p.onProgress);
}

export async function addLiquidity(p: {
  publicKey: string;
  tokenA: string;
  tokenB: string;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadline: number;
}): Promise<string> {
  await ensureAllowance(p.publicKey, p.tokenA, p.amountADesired);
  await ensureAllowance(p.publicKey, p.tokenB, p.amountBDesired);
  return buildAndSubmit(p.publicKey, CONTRACTS.router, 'add_liquidity', [
    new Address(p.publicKey).toScVal(),
    new Address(p.tokenA).toScVal(),
    new Address(p.tokenB).toScVal(),
    nativeToScVal(p.amountADesired, { type: 'i128' }),
    nativeToScVal(p.amountBDesired, { type: 'i128' }),
    nativeToScVal(p.amountAMin, { type: 'i128' }),
    nativeToScVal(p.amountBMin, { type: 'i128' }),
    new Address(p.publicKey).toScVal(),
    nativeToScVal(BigInt(p.deadline), { type: 'u64' }),
  ]);
}

export async function removeLiquidity(p: {
  publicKey: string;
  pairAddress: string;
  tokenA: string;
  tokenB: string;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  deadline: number;
}): Promise<string> {
  // Approve the pair's LP tokens for the Router to pull and burn
  const ledger = await getCurrentLedger();
  await buildAndSubmit(p.publicKey, p.pairAddress, 'lp_approve', [
    new Address(p.publicKey).toScVal(),
    new Address(CONTRACTS.router).toScVal(),
    nativeToScVal(p.liquidity, { type: 'i128' }),
    nativeToScVal(ledger + 500_000, { type: 'u32' }),
  ]);

  return buildAndSubmit(p.publicKey, CONTRACTS.router, 'remove_liquidity', [
    new Address(p.publicKey).toScVal(),
    new Address(p.tokenA).toScVal(),
    new Address(p.tokenB).toScVal(),
    nativeToScVal(p.liquidity, { type: 'i128' }),
    nativeToScVal(p.amountAMin, { type: 'i128' }),
    nativeToScVal(p.amountBMin, { type: 'i128' }),
    new Address(p.publicKey).toScVal(),
    nativeToScVal(BigInt(p.deadline), { type: 'u64' }),
  ]);
}
