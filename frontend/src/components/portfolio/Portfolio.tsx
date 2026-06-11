'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '../../context/WalletContext';
import { usePoolData, usdValue, PriceMap, PoolData } from '../../hooks/usePoolData';
import { useBalances } from '../../hooks/useBalances';
import { TokenIcon } from '../ui/TokenIcon';
import { Spinner } from '../ui/Spinner';
import { TOKEN_LIST, tokenBySac, EXPLORER } from '../../lib/constants';
import { fromStroops, fmtAmount, fmtUsd, shortAddr } from '../../lib/format';
import { getLpBalance } from '../../lib/soroban';

interface LpPosition {
  pool: PoolData;
  lp: bigint;
  shareX: number; // underlying token X amount
  shareY: number;
  usd: number;
}

export function Portfolio() {
  const { publicKey, isConnected, connect } = useWallet();
  const { pools, prices, loading: poolsLoading } = usePoolData();
  const { balances, loading: balLoading } = useBalances(publicKey);
  const [positions, setPositions] = useState<LpPosition[]>([]);
  const [lpLoading, setLpLoading] = useState(false);

  // Compute LP positions across pools
  useEffect(() => {
    if (!publicKey || pools.length === 0) { setPositions([]); return; }
    let cancelled = false;
    setLpLoading(true);
    (async () => {
      const result: LpPosition[] = [];
      for (const pool of pools) {
        const lp = await getLpBalance(publicKey, pool.address);
        if (lp <= 0n || pool.lpSupply <= 0n) continue;
        const shareFrac = Number(lp) / Number(pool.lpSupply);
        const shareX = fromStroops(pool.reserveX) * shareFrac;
        const shareY = fromStroops(pool.reserveY) * shareFrac;
        const usd =
          usdValue(pool.symbolX, shareX, prices) + usdValue(pool.symbolY, shareY, prices);
        result.push({ pool, lp, shareX, shareY, usd });
      }
      if (!cancelled) { setPositions(result); setLpLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [publicKey, pools, prices]);

  if (!isConnected) {
    return (
      <div className="card max-w-lg mx-auto p-10 text-center">
        <h2 className="text-xl font-semibold text-txt-primary mb-2">Your Portfolio</h2>
        <p className="text-txt-tertiary text-sm mb-6">Connect your wallet to view balances and positions.</p>
        <button onClick={connect} className="btn-pink-soft px-6 py-3">Connect Wallet</button>
      </div>
    );
  }

  const tokenRows = TOKEN_LIST.map(t => {
    const bal = balances[t.sac] ?? 0n;
    const amount = fromStroops(bal);
    return { token: t, amount, usd: usdValue(t.symbol, amount, prices) };
  });

  const walletTotal = tokenRows.reduce((s, r) => s + r.usd, 0);
  const lpTotal = positions.reduce((s, p) => s + p.usd, 0);
  const total = walletTotal + lpTotal;
  const loading = poolsLoading || balLoading || lpLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Total value */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-txt-tertiary text-sm">Total balance</div>
            <div className="text-4xl font-bold text-txt-primary mt-1">{fmtUsd(total)}</div>
          </div>
          <div className="text-right">
            <div className="text-txt-tertiary text-xs flex items-center gap-1.5 justify-end">
              {loading && <Spinner size={12} />} {shortAddr(publicKey!, 6, 6)}
            </div>
            <div className="text-txt-tertiary text-xs mt-1">
              Wallet {fmtUsd(walletTotal)} · Pools {fmtUsd(lpTotal)}
            </div>
          </div>
        </div>
      </div>

      {/* Tokens */}
      <section>
        <h3 className="text-txt-secondary font-semibold mb-3 px-1">Tokens</h3>
        <div className="card divide-y divide-bg-interactive">
          {tokenRows.map(r => (
            <div key={r.token.sac} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <TokenIcon token={r.token} size={36} />
                <div>
                  <div className="text-txt-primary font-medium">{r.token.symbol}</div>
                  <div className="text-txt-tertiary text-xs">{r.token.name}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-txt-primary font-medium">{fmtAmount(r.amount)}</div>
                <div className="text-txt-tertiary text-xs">{fmtUsd(r.usd)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LP positions */}
      <section>
        <h3 className="text-txt-secondary font-semibold mb-3 px-1">Liquidity positions</h3>
        <div className="card">
          {positions.length === 0 ? (
            <div className="p-8 text-center text-txt-tertiary text-sm">
              {lpLoading ? 'Loading positions…' : 'No liquidity positions yet.'}
            </div>
          ) : (
            <div className="divide-y divide-bg-interactive">
              {positions.map(p => {
                const tx = tokenBySac(p.pool.tokenX);
                const ty = tokenBySac(p.pool.tokenY);
                return (
                  <div key={p.pool.address} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {tx && <TokenIcon token={tx} size={24} />}
                        {ty && <TokenIcon token={ty} size={24} />}
                        <span className="text-txt-primary font-medium">{p.pool.name}</span>
                      </div>
                      <div className="text-txt-primary font-medium">{fmtUsd(p.usd)}</div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-txt-tertiary">
                      <span>
                        {fmtAmount(p.shareX)} {p.pool.symbolX} + {fmtAmount(p.shareY)} {p.pool.symbolY}
                      </span>
                      <a href={`${EXPLORER}/contract/${p.pool.address}`} target="_blank" rel="noopener noreferrer"
                        className="hover:text-uni-pink">{fmtAmount(p.lp)} LP ↗</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
