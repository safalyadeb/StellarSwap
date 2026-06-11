'use client';

import Link from 'next/link';
import { usePoolData, usdValue } from '../../hooks/usePoolData';
import { TokenIcon } from '../ui/TokenIcon';
import { Spinner } from '../ui/Spinner';
import { tokenBySac, EXPLORER } from '../../lib/constants';
import { fromStroops, fmtAmount, fmtUsd } from '../../lib/format';

export function PoolExplorer() {
  const { pools, prices, loading, lastUpdated } = usePoolData();

  const rows = pools.map(p => {
    const tvl =
      usdValue(p.symbolX, fromStroops(p.reserveX), prices) +
      usdValue(p.symbolY, fromStroops(p.reserveY), prices);
    return { ...p, tvl };
  });

  const totalTvl = rows.reduce((s, r) => s + r.tvl, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Explore pools</h1>
          <p className="text-txt-tertiary text-sm">Live liquidity across StellarSwap.</p>
        </div>
        <div className="text-right">
          <div className="text-txt-tertiary text-xs">Total TVL</div>
          <div className="text-xl font-bold text-txt-primary flex items-center gap-2 justify-end">
            {loading && pools.length === 0 && <Spinner size={14} />}
            {fmtUsd(totalTvl)}
          </div>
        </div>
      </div>

      {/* ── Desktop table ───────────────────────────────────── */}
      <div className="card overflow-hidden hidden sm:block">
        <div className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2 px-5 py-3 text-xs text-txt-tertiary border-b border-bg-interactive">
          <span>Pool</span>
          <span className="text-right">Reserves</span>
          <span className="text-right">TVL</span>
          <span className="text-right pl-4">Action</span>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center text-txt-tertiary text-sm">
            {loading ? 'Loading pools…' : 'No pools deployed.'}
          </div>
        ) : (
          rows.map(p => {
            const tx = tokenBySac(p.tokenX);
            const ty = tokenBySac(p.tokenY);
            return (
              <div
                key={p.address}
                className="grid grid-cols-[2fr_1.5fr_1.5fr_auto] gap-2 px-5 py-4 items-center hover:bg-bg-module/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex -space-x-1">
                    {tx && <TokenIcon token={tx} size={26} />}
                    {ty && <TokenIcon token={ty} size={26} />}
                  </div>
                  <span className="text-txt-primary font-medium truncate">{p.name}</span>
                </div>
                <div className="text-right text-txt-secondary text-sm">
                  <div>{fmtAmount(p.reserveX)} {p.symbolX}</div>
                  <div>{fmtAmount(p.reserveY)} {p.symbolY}</div>
                </div>
                <div className="text-right text-txt-primary font-medium">{fmtUsd(p.tvl)}</div>
                <div className="flex gap-2 justify-end pl-4">
                  <Link href="/" className="btn-pink-soft text-xs px-3 py-1.5">Trade</Link>
                  <Link href="/pool" className="bg-bg-interactive hover:bg-bg-outline text-txt-secondary text-xs px-3 py-1.5 rounded-pill transition-colors">Add</Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Mobile cards ────────────────────────────────────── */}
      <div className="sm:hidden space-y-3">
        {rows.length === 0 ? (
          <div className="card p-8 text-center text-txt-tertiary text-sm">
            {loading ? 'Loading pools…' : 'No pools deployed.'}
          </div>
        ) : (
          rows.map(p => {
            const tx = tokenBySac(p.tokenX);
            const ty = tokenBySac(p.tokenY);
            return (
              <div key={p.address} className="card p-4 space-y-3">
                {/* Pool identity + TVL */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {tx && <TokenIcon token={tx} size={28} />}
                      {ty && <TokenIcon token={ty} size={28} />}
                    </div>
                    <span className="text-txt-primary font-semibold">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-txt-disabled text-[10px] uppercase tracking-wide">TVL</div>
                    <div className="text-txt-primary font-bold">{fmtUsd(p.tvl)}</div>
                  </div>
                </div>

                {/* Reserves */}
                <div className="flex gap-3 text-sm text-txt-secondary bg-bg-module rounded-xl px-3 py-2">
                  <div className="flex-1">
                    <div className="text-txt-disabled text-[10px] uppercase tracking-wide mb-0.5">{p.symbolX}</div>
                    <div className="font-medium text-txt-primary">{fmtAmount(p.reserveX)}</div>
                  </div>
                  <div className="w-px bg-bg-interactive" />
                  <div className="flex-1">
                    <div className="text-txt-disabled text-[10px] uppercase tracking-wide mb-0.5">{p.symbolY}</div>
                    <div className="font-medium text-txt-primary">{fmtAmount(p.reserveY)}</div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Link href="/" className="btn-pink-soft text-sm px-4 py-2 flex-1 text-center font-medium">
                    Trade
                  </Link>
                  <Link href="/pool" className="bg-bg-interactive hover:bg-bg-outline text-txt-secondary text-sm px-4 py-2 rounded-pill flex-1 text-center transition-colors">
                    Add Liquidity
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {lastUpdated > 0 && (
        <p className="text-center text-txt-disabled text-xs">
          Updated {new Date(lastUpdated).toLocaleTimeString()} · auto-refreshes every 10s
        </p>
      )}
    </div>
  );
}
