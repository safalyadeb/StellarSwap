//! Client-side AMM math — exact BigInt mirror of the Soroban contract math.
//! Used for instant quotes (both directions) without an RPC round-trip per keystroke.

const FEE_NUM = 997n;
const FEE_DEN = 1000n;

/** Exact-input → output. Mirrors contracts/shared/src/math.rs::get_amount_out. */
export function getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inWithFee = amountIn * FEE_NUM;
  return (inWithFee * reserveOut) / (reserveIn * FEE_DEN + inWithFee);
}

/** Exact-output → required input. Mirrors get_amount_in (rounds up). */
export function getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountOut <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  if (amountOut >= reserveOut) return 0n; // not enough liquidity
  const numerator = reserveIn * amountOut * FEE_DEN;
  const denominator = (reserveOut - amountOut) * FEE_NUM;
  return numerator / denominator + 1n;
}

/** Proportional price (no fee, no impact). */
export function quote(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  if (amountA <= 0n || reserveA <= 0n || reserveB <= 0n) return 0n;
  return (amountA * reserveB) / reserveA;
}

/** Price impact as a fraction 0..1 for an exact-input trade. */
export function priceImpact(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): number {
  if (reserveIn === 0n || reserveOut === 0n) return 0;
  const out = getAmountOut(amountIn, reserveIn, reserveOut);
  const spotOut = (amountIn * reserveOut) / reserveIn; // zero-impact output
  if (spotOut === 0n) return 0;
  const diff = Number(spotOut - out);
  return diff / Number(spotOut);
}

/** Mid price of token B per token A given reserves. */
export function midPrice(reserveA: bigint, reserveB: bigint): number {
  if (reserveA === 0n) return 0;
  return Number(reserveB) / Number(reserveA);
}
