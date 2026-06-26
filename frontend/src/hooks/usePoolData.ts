'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PAIR_LIST, TOKENS, USD_ANCHOR_SYMBOL, tokenBySac } from '../lib/constants';
import { getReserves, getLpTotalSupply } from '../lib/soroban';
import { allPairsLength } from '../lib/contract';
import { fromStroops } from '../lib/format';

export interface PoolData {
  name: string;
  address: string;
  tokenX: string; // sac
  tokenY: string; // sac
  symbolX: string;
  symbolY: string;
  reserveX: bigint;
  reserveY: bigint;
  lpSupply: bigint;
}

/** USD prices keyed by token symbol, derived live from pool reserves. */
export type PriceMap = Record<string, number>;

const POLL_MS = 10_000;

/**
 * Polls all pools for reserves + LP supply, and derives USD prices.
 * USDC = $1 anchor; other prices come from pool ratios.
 */
export function usePoolData() {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [prices, setPrices] = useState<PriceMap>({ [USD_ANCHOR_SYMBOL]: 1 });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);
  const [factoryPoolCount, setFactoryPoolCount] = useState<number>(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [count, results] = await Promise.all([
        allPairsLength(),
        Promise.all(
        PAIR_LIST.map(async (p) => {
          const [rx, ry] = await getReserves(p.address);
          const lp = await getLpTotalSupply(p.address);
          return {
            name: p.name,
            address: p.address,
            tokenX: p.token_x,
            tokenY: p.token_y,
            symbolX: p.symbol_x,
            symbolY: p.symbol_y,
            reserveX: rx,
            reserveY: ry,
            lpSupply: lp,
          } as PoolData;
        }),
        )]);
      if (!mounted.current) return;
      setPools(results);
      setPrices(derivePrices(results));
      setFactoryPoolCount(count);
      setLastUpdated(Date.now());
    } catch {
      /* keep previous data */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return { pools, prices, loading, lastUpdated, factoryPoolCount, refresh };
}

/**
 * Derive USD prices from pool reserves.
 * Anchor: USDC = $1. XLM from XLM/USDC. EURC from XLM/EURC × XLM price. Etc.
 * Iterates so tokens priced via an intermediate (e.g. EURC via XLM) resolve.
 */
function derivePrices(pools: PoolData[]): PriceMap {
  const prices: PriceMap = { [USD_ANCHOR_SYMBOL]: 1 };

  for (let pass = 0; pass < 3; pass++) {
    for (const pool of pools) {
      const rx = fromStroops(pool.reserveX);
      const ry = fromStroops(pool.reserveY);
      if (rx === 0 || ry === 0) continue;

      // price of X in terms of Y = ry / rx; and vice versa
      const xPerY = rx / ry;
      const yPerX = ry / rx;

      // If we know Y's USD price, derive X
      if (prices[pool.symbolY] != null && prices[pool.symbolX] == null) {
        prices[pool.symbolX] = prices[pool.symbolY] * yPerX;
      }
      // If we know X's USD price, derive Y
      if (prices[pool.symbolX] != null && prices[pool.symbolY] == null) {
        prices[pool.symbolY] = prices[pool.symbolX] * xPerY;
      }
    }
  }
  return prices;
}

export function usdValue(symbol: string, amount: number, prices: PriceMap): number {
  const p = prices[symbol];
  return p != null ? amount * p : 0;
}
