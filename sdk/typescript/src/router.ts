import {
  Contract,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  xdr,
} from '@stellar/stellar-sdk';
import { NetworkConfig, SwapParams, AddLiquidityParams, RemoveLiquidityParams } from './types';
import { getAmountsOut, getAmountsIn } from './math';

/**
 * RouterClient wraps all Router contract functions for TypeScript consumers.
 *
 * Usage:
 *   const router = new RouterClient(config);
 *   const amounts = await router.getAmountsOut(1_000_000n, [TOKEN_A, TOKEN_B]);
 *   await router.swapExactTokensForTokens({ ... });
 */
export class RouterClient {
  private readonly contractId: string;
  private readonly config: NetworkConfig;

  constructor(config: NetworkConfig) {
    this.contractId = config.contracts.router;
    this.config = config;
  }

  /**
   * Build (but don't submit) a swap_exact_tokens_for_tokens transaction.
   * The caller signs and submits the returned XDR.
   */
  buildSwapExactIn(params: SwapParams): xdr.TransactionEnvelope {
    const contract = new Contract(this.contractId);

    const op = contract.call(
      'swap_exact_tokens_for_tokens',
      new Address(params.caller).toScVal(),
      nativeToScVal(params.amountIn, { type: 'i128' }),
      nativeToScVal(params.amountOutMin, { type: 'i128' }),
      nativeToScVal(params.path.map(t => new Address(t).toScVal())),
      new Address(params.to).toScVal(),
      nativeToScVal(BigInt(params.deadline), { type: 'u64' }),
    );

    return this.buildTx([op], params.caller);
  }

  /**
   * Build an add_liquidity transaction.
   */
  buildAddLiquidity(params: AddLiquidityParams): xdr.TransactionEnvelope {
    const contract = new Contract(this.contractId);

    const op = contract.call(
      'add_liquidity',
      new Address(params.caller).toScVal(),
      new Address(params.tokenA).toScVal(),
      new Address(params.tokenB).toScVal(),
      nativeToScVal(params.amountADesired, { type: 'i128' }),
      nativeToScVal(params.amountBDesired, { type: 'i128' }),
      nativeToScVal(params.amountAMin, { type: 'i128' }),
      nativeToScVal(params.amountBMin, { type: 'i128' }),
      new Address(params.to).toScVal(),
      nativeToScVal(BigInt(params.deadline), { type: 'u64' }),
    );

    return this.buildTx([op], params.caller);
  }

  /**
   * Build a remove_liquidity transaction.
   */
  buildRemoveLiquidity(params: RemoveLiquidityParams): xdr.TransactionEnvelope {
    const contract = new Contract(this.contractId);

    const op = contract.call(
      'remove_liquidity',
      new Address(params.caller).toScVal(),
      new Address(params.tokenA).toScVal(),
      new Address(params.tokenB).toScVal(),
      nativeToScVal(params.liquidity, { type: 'i128' }),
      nativeToScVal(params.amountAMin, { type: 'i128' }),
      nativeToScVal(params.amountBMin, { type: 'i128' }),
      new Address(params.to).toScVal(),
      nativeToScVal(BigInt(params.deadline), { type: 'u64' }),
    );

    return this.buildTx([op], params.caller);
  }

  /**
   * Client-side quote for a multi-hop swap.
   * Requires pre-fetched reserves for each hop.
   *
   * For on-chain quotes, call get_amounts_out view function instead.
   */
  quoteLocal(
    amountIn: bigint,
    reserves: Array<[bigint, bigint]>,
  ): bigint[] {
    return getAmountsOut(amountIn, reserves);
  }

  private buildTx(
    ops: xdr.Operation[],
    sourceAccount: string,
  ): xdr.TransactionEnvelope {
    const networkPassphrase = this.config.networkPassphrase;
    const tx = new TransactionBuilder(
      { accountId: () => sourceAccount, sequenceNumber: () => '0', incrementSequenceNumber: () => {} } as any,
      { fee: BASE_FEE, networkPassphrase },
    );
    ops.forEach(op => tx.addOperation(op));
    return tx.setTimeout(30).build().toEnvelope();
  }
}
