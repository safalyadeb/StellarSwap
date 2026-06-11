export interface NetworkConfig {
  network: 'testnet' | 'mainnet' | 'local';
  rpcUrl: string;
  networkPassphrase: string;
  contracts: {
    factory: string;
    router: string;
    pairWasmHash?: string;
  };
}

export interface SwapParams {
  caller: string;
  amountIn: bigint;
  amountOutMin: bigint;
  path: string[];
  to: string;
  deadline: number;
}

export interface SwapExactOutParams {
  caller: string;
  amountOut: bigint;
  amountInMax: bigint;
  path: string[];
  to: string;
  deadline: number;
}

export interface AddLiquidityParams {
  caller: string;
  tokenA: string;
  tokenB: string;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  to: string;
  deadline: number;
}

export interface RemoveLiquidityParams {
  caller: string;
  tokenA: string;
  tokenB: string;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  to: string;
  deadline: number;
}

export interface SwapResult {
  amountsIn: bigint[];
  amountsOut: bigint[];
}

export interface LiquidityResult {
  amountA: bigint;
  amountB: bigint;
  lpMinted: bigint;
}

export interface RemoveLiquidityResult {
  amountA: bigint;
  amountB: bigint;
}

export interface PoolInfo {
  address: string;
  tokenX: string;
  tokenY: string;
  reserveX: bigint;
  reserveY: bigint;
  lpTotalSupply: bigint;
}

export interface QuoteResult {
  amountOut: bigint;
  priceImpact: number;
  fee: bigint;
}
