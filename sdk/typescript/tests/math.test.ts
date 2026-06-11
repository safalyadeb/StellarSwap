import {
  getAmountOut,
  getAmountIn,
  quote,
  getAmountsOut,
  sqrt,
  calcFirstDepositLp,
  calcSubsequentDepositLp,
  MINIMUM_LIQUIDITY,
} from '../src/math';

describe('getAmountOut', () => {
  it('matches Rust contract output for symmetric pool', () => {
    // Same test as Rust: reserve_in=1000, reserve_out=1000, amount_in=100
    // Expected: floor((100 * 997 * 1000) / (1000 * 1000 + 100 * 997)) = 90
    expect(getAmountOut(100n, 1000n, 1000n)).toBe(90n);
  });

  it('invariant holds after swap', () => {
    const rIn = 1_000_000n, rOut = 1_000_000n, amountIn = 100_000n;
    const out = getAmountOut(amountIn, rIn, rOut);
    expect((rIn + amountIn) * (rOut - out)).toBeGreaterThanOrEqual(rIn * rOut);
  });

  it('output is always less than reserve', () => {
    expect(getAmountOut(999_999n, 1_000_000n, 1_000_000n)).toBeLessThan(1_000_000n);
  });

  it('throws on zero input', () => {
    expect(() => getAmountOut(0n, 1000n, 1000n)).toThrow('InsufficientInputAmount');
  });

  it('throws on zero reserve', () => {
    expect(() => getAmountOut(100n, 0n, 1000n)).toThrow('InsufficientLiquidity');
  });
});

describe('getAmountIn', () => {
  it('round trip: get_amount_in then get_amount_out yields >= desired output', () => {
    const rIn = 1_000_000n, rOut = 1_000_000n, desiredOut = 90_000n;
    const needed = getAmountIn(desiredOut, rIn, rOut);
    const actual = getAmountOut(needed, rIn, rOut);
    expect(actual).toBeGreaterThanOrEqual(desiredOut);
  });

  it('throws if amount_out >= reserve', () => {
    expect(() => getAmountIn(1001n, 1000n, 1000n)).toThrow('InsufficientReserve');
  });
});

describe('quote', () => {
  it('returns proportional amount', () => {
    expect(quote(100n, 1000n, 2000n)).toBe(200n);
  });

  it('identity for equal reserves', () => {
    expect(quote(500n, 1000n, 1000n)).toBe(500n);
  });
});

describe('getAmountsOut', () => {
  it('chains two hops correctly', () => {
    const r1: [bigint, bigint] = [1_000_000n, 1_000_000n];
    const r2: [bigint, bigint] = [1_000_000n, 1_000_000n];
    const amounts = getAmountsOut(10_000n, [r1, r2]);
    expect(amounts).toHaveLength(3);
    expect(amounts[0]).toBe(10_000n);
    // Each hop takes a fee, so amounts should decrease
    expect(amounts[1]).toBeLessThan(amounts[0]);
    expect(amounts[2]).toBeLessThan(amounts[1]);
  });
});

describe('sqrt', () => {
  it('perfect squares', () => {
    expect(sqrt(0n)).toBe(0n);
    expect(sqrt(1n)).toBe(1n);
    expect(sqrt(4n)).toBe(2n);
    expect(sqrt(9n)).toBe(3n);
    expect(sqrt(1_000_000n)).toBe(1000n);
  });

  it('rounds down', () => {
    expect(sqrt(2n)).toBe(1n);
    expect(sqrt(8n)).toBe(2n);
  });

  it('satisfies invariant: s^2 <= n < (s+1)^2', () => {
    const testCases = [0n, 1n, 4n, 16n, 99n, 100n, 101n, 999_999n, 1_000_000n];
    for (const n of testCases) {
      const s = sqrt(n);
      expect(s * s).toBeLessThanOrEqual(n);
      expect((s + 1n) * (s + 1n)).toBeGreaterThan(n);
    }
  });
});

describe('LP token calculations', () => {
  it('first deposit: sqrt(x*y) - MINIMUM_LIQUIDITY', () => {
    const lp = calcFirstDepositLp(10_000n, 10_000n);
    // sqrt(10000 * 10000) - 1000 = 10000 - 1000 = 9000
    expect(lp).toBe(9000n);
  });

  it('subsequent deposit: min proportional', () => {
    const lp = calcSubsequentDepositLp(
      5_000n, 5_000n, 10_000n, 10_000n, 10_000n
    );
    // min(5000*10000/10000, 5000*10000/10000) = 5000
    expect(lp).toBe(5000n);
  });

  it('asymmetric subsequent deposit uses minimum', () => {
    // Deposit more X than proportional — limited by Y
    const lp = calcSubsequentDepositLp(
      6_000n, 5_000n, 10_000n, 10_000n, 10_000n
    );
    // lp_x = 6000*10000/10000 = 6000
    // lp_y = 5000*10000/10000 = 5000
    // min = 5000
    expect(lp).toBe(5000n);
  });
});

describe('fee verification', () => {
  it('fee is approximately 0.3%', () => {
    const rIn = 1_000_000_000n, rOut = 1_000_000_000n, amountIn = 10_000_000n;
    const outWithFee = getAmountOut(amountIn, rIn, rOut);
    const outNoFee = amountIn * rOut / (rIn + amountIn);

    // Ratio should be ~99.7% (997/1000)
    const ratioBps = Number(outWithFee * 10000n / outNoFee);
    expect(ratioBps).toBeGreaterThanOrEqual(9960);
    expect(ratioBps).toBeLessThanOrEqual(9980);
  });
});
