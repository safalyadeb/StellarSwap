import { getAmountOut, getAmountIn, quote, priceImpact, midPrice } from '../math';

describe('getAmountOut (client mirror of Soroban math)', () => {
  it('matches the on-chain contract output for a symmetric pool', () => {
    // floor((100 * 997 * 1000) / (1000 * 1000 + 100 * 997)) = 90
    expect(getAmountOut(100n, 1000n, 1000n)).toBe(90n);
  });

  it('preserves the constant-product invariant after a swap', () => {
    const rIn = 1_000_000n;
    const rOut = 1_000_000n;
    const amountIn = 100_000n;
    const out = getAmountOut(amountIn, rIn, rOut);
    expect((rIn + amountIn) * (rOut - out)).toBeGreaterThanOrEqual(rIn * rOut);
  });

  it('never returns more than the output reserve', () => {
    expect(getAmountOut(999_999n, 1_000_000n, 1_000_000n)).toBeLessThan(1_000_000n);
  });

  it('returns 0 for non-positive input or empty reserves', () => {
    expect(getAmountOut(0n, 1000n, 1000n)).toBe(0n);
    expect(getAmountOut(100n, 0n, 1000n)).toBe(0n);
    expect(getAmountOut(100n, 1000n, 0n)).toBe(0n);
  });

  it('charges approximately the 0.3% fee', () => {
    const rIn = 1_000_000_000n;
    const rOut = 1_000_000_000n;
    const amountIn = 10_000_000n;
    const withFee = getAmountOut(amountIn, rIn, rOut);
    const noFee = (amountIn * rOut) / (rIn + amountIn);
    const ratioBps = Number((withFee * 10_000n) / noFee);
    expect(ratioBps).toBeGreaterThanOrEqual(9960);
    expect(ratioBps).toBeLessThanOrEqual(9980);
  });
});

describe('getAmountIn', () => {
  it('round-trips: the required input yields at least the desired output', () => {
    const rIn = 1_000_000n;
    const rOut = 1_000_000n;
    const desiredOut = 90_000n;
    const needed = getAmountIn(desiredOut, rIn, rOut);
    expect(getAmountOut(needed, rIn, rOut)).toBeGreaterThanOrEqual(desiredOut);
  });

  it('returns 0 when the requested output exceeds liquidity', () => {
    expect(getAmountIn(1000n, 1000n, 1000n)).toBe(0n);
  });
});

describe('quote', () => {
  it('returns a proportional amount with no fee', () => {
    expect(quote(100n, 1000n, 2000n)).toBe(200n);
  });

  it('is the identity for equal reserves', () => {
    expect(quote(500n, 1000n, 1000n)).toBe(500n);
  });
});

describe('priceImpact', () => {
  it('stays small for a modest trade against a deep pool', () => {
    // Floors near the 0.3% fee for small trades; well under 1%.
    const impact = priceImpact(10_000n, 1_000_000_000n, 1_000_000_000n);
    expect(impact).toBeGreaterThan(0);
    expect(impact).toBeLessThan(0.01);
  });

  it('grows as the trade size approaches the reserve', () => {
    const small = priceImpact(1_000n, 1_000_000n, 1_000_000n);
    const large = priceImpact(500_000n, 1_000_000n, 1_000_000n);
    expect(large).toBeGreaterThan(small);
  });
});

describe('midPrice', () => {
  it('computes reserveB per reserveA', () => {
    expect(midPrice(1000n, 2000n)).toBe(2);
  });

  it('returns 0 for an empty pool', () => {
    expect(midPrice(0n, 1000n)).toBe(0);
  });
});
