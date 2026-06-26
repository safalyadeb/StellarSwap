import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
  xdr,
  nativeToScVal,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';
import { server, networkPassphrase } from './stellar-sdk';
import { CONTRACTS, READ_ACCOUNT } from './constants';

export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ?? CONTRACTS.router;

// Generic contract caller — signs with a secret key (admin scripts / server-side use).
// Browser-side user transactions use Freighter signing via soroban.ts instead.
export async function callContractFunction(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
  signerSecret: string,
): Promise<unknown> {
  const keypair = Keypair.fromSecret(signerSecret);
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(contractId);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = rpc.assembleTransaction(built, sim).build();
  prepared.sign(keypair);

  const sent = await server.sendTransaction(prepared);
  if (sent.status === 'ERROR') throw new Error('Transaction submission failed');

  const hash = sent.hash;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    const res = await server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return 'returnValue' in res && res.returnValue
        ? scValToNative(res.returnValue)
        : null;
    }
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain (${hash.slice(0, 8)}…)`);
    }
  }
  throw new Error('Timed out waiting for confirmation');
}

// ── Read-only simulation helpers ─────────────────────────────────────────────

async function simCall<T = unknown>(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T | null> {
  try {
    const account = await server.getAccount(READ_ACCOUNT);
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase,
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

// ── Router contract callers ──────────────────────────────────────────────────

export async function getFactory(): Promise<string | null> {
  return simCall<string>(CONTRACTS.router, 'get_factory');
}

export async function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): Promise<bigint> {
  const result = await simCall<string | number>(CONTRACTS.router, 'get_amount_out', [
    nativeToScVal(amountIn, { type: 'i128' }),
    nativeToScVal(reserveIn, { type: 'i128' }),
    nativeToScVal(reserveOut, { type: 'i128' }),
  ]);
  return result != null ? BigInt(result) : 0n;
}

export async function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): Promise<bigint> {
  const result = await simCall<string | number>(CONTRACTS.router, 'get_amount_in', [
    nativeToScVal(amountOut, { type: 'i128' }),
    nativeToScVal(reserveIn, { type: 'i128' }),
    nativeToScVal(reserveOut, { type: 'i128' }),
  ]);
  return result != null ? BigInt(result) : 0n;
}

export async function quoteAmount(
  amountA: bigint,
  reserveA: bigint,
  reserveB: bigint,
): Promise<bigint> {
  const result = await simCall<string | number>(CONTRACTS.router, 'quote', [
    nativeToScVal(amountA, { type: 'i128' }),
    nativeToScVal(reserveA, { type: 'i128' }),
    nativeToScVal(reserveB, { type: 'i128' }),
  ]);
  return result != null ? BigInt(result) : 0n;
}

// ── Factory contract callers ──────────────────────────────────────────────────

export async function pairExists(tokenA: string, tokenB: string): Promise<boolean> {
  const result = await simCall<boolean>(CONTRACTS.factory, 'pair_exists', [
    new Address(tokenA).toScVal(),
    new Address(tokenB).toScVal(),
  ]);
  return result ?? false;
}

export async function getPair(tokenA: string, tokenB: string): Promise<string | null> {
  return simCall<string>(CONTRACTS.factory, 'get_pair', [
    new Address(tokenA).toScVal(),
    new Address(tokenB).toScVal(),
  ]);
}

export async function allPairsLength(): Promise<number> {
  const result = await simCall<number>(CONTRACTS.factory, 'all_pairs_length');
  return result ?? 0;
}
