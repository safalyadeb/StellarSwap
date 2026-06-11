//! Client-side math utilities — exact BigInt mirrors of Rust contract math.
//! These are used for quoting and UI calculations before submitting transactions.

/** 0.3% fee: effective input = amount * 997 / 1000 */
const FEE_NUMERATOR = 997n;
const FEE_DENOMINATOR = 1000n;

/**
 * Given an exact input, calculate the maximum output.
 * Mirrors contracts/shared/src/math.rs::get_amount_out exactly.
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn <= 0n) throw new Error('InsufficientInputAmount');
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error('InsufficientLiquidity');

  const amountInWithFee = amountIn * FEE_NUMERATOR;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * FEE_DENOMINATOR + amountInWithFee;

  return numerator / denominator;
}

/**
 * Given an exact output, calculate the minimum input required.
 * Mirrors contracts/shared/src/math.rs::get_amount_in exactly.
 */
export function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountOut <= 0n) throw new Error('InsufficientOutputAmount');
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error('InsufficientLiquidity');
  if (amountOut >= reserveOut) throw new Error('InsufficientReserve');

  const numerator = reserveIn * amountOut * FEE_DENOMINATOR;
  const denominator = (reserveOut - amountOut) * FEE_NUMERATOR;

  return numerator / denominator + 1n;
}

/**
 * Price quote for a proportional deposit — no fee, no price impact.
 * Mirrors contracts/shared/src/math.rs::quote exactly.
 */
export function quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  if (amountA <= 0n) throw new Error('InsufficientInputAmount');
  if (reserveA <= 0n || reserveB <= 0n) throw new Error('InsufficientLiquidity');
  return (amountA * reserveB) / reserveA;
}

/**
 * Compute all output amounts along a multi-hop path.
 * Each element in `reserves` is [reserveIn, reserveOut] for that hop.
 */
export function getAmountsOut(
  amountIn: bigint,
  reserves: Array<[bigint, bigint]>,
): bigint[] {
  const amounts: bigint[] = [amountIn];
  for (const [rIn, rOut] of reserves) {
    amounts.push(getAmountOut(amounts[amounts.length - 1], rIn, rOut));
  }
  return amounts;
}

/**
 * Compute all input amounts needed for a multi-hop exact-output path.
 */
export function getAmountsIn(
  amountOut: bigint,
  reserves: Array<[bigint, bigint]>,
): bigint[] {
  const n = reserves.length;
  const amounts: bigint[] = new Array(n + 1).fill(0n);
  amounts[n] = amountOut;
  for (let i = n - 1; i >= 0; i--) {
    amounts[i] = getAmountIn(amounts[i + 1], reserves[i][0], reserves[i][1]);
  }
  return amounts;
}

/**
 * Calculate price impact as a fraction 0–1.
 * For display: multiply by 100 for percentage.
 */
export function calcPriceImpact(amountIn: bigint, reserveIn: bigint): number {
  if (reserveIn === 0n) return 1;
  return Number(amountIn) / Number(reserveIn + amountIn);
}

/**
 * Integer square root (floor).
 */
export function sqrt(y: bigint): bigint {
  if (y < 0n) throw new Error('sqrt of negative');
  if (y === 0n) return 0n;
  if (y < 4n) return 1n;

  let z = y;
  let x = y / 2n + 1n;
  while (x < z) {
    z = x;
    x = (y / x + x) / 2n;
  }
  return z;
}

/** Minimum LP tokens permanently locked on first deposit. */
export const MINIMUM_LIQUIDITY = 1000n;

/**
 * Calculate LP tokens minted for first deposit.
 */
export function calcFirstDepositLp(amountX: bigint, amountY: bigint): bigint {
  return sqrt(amountX * amountY) - MINIMUM_LIQUIDITY;
}

/**
 * Calculate LP tokens minted for subsequent deposits.
 */
export function calcSubsequentDepositLp(
  amountX: bigint,
  amountY: bigint,
  reserveX: bigint,
  reserveY: bigint,
  totalSupply: bigint,
): bigint {
  const lpX = (amountX * totalSupply) / reserveX;
  const lpY = (amountY * totalSupply) / reserveY;
  return lpX < lpY ? lpX : lpY;
}
