'use client';

import { useState, useMemo } from 'react';
import { useWallet } from '../../context/WalletContext';
import { usePoolData, usdValue } from '../../hooks/usePoolData';
import { useBalances } from '../../hooks/useBalances';
import { TokenIcon } from '../ui/TokenIcon';
import { Spinner } from '../ui/Spinner';
import { TokenSelector } from '../TokenSelector';
import { TOKENS, TokenMeta, resolvePair, EXPLORER, DEFAULT_DEADLINE_MINS } from '../../lib/constants';
import { quote } from '../../lib/math';
import { fromStroops, toStroops, fmtAmount, fmtUsd } from '../../lib/format';
import { addLiquidity, removeLiquidity, getLpBalance } from '../../lib/soroban';
import { useEffect } from 'react';

type Tab = 'add' | 'remove';

export function LiquidityWidget() {
  const { publicKey, isConnected, connect } = useWallet();
  const { pools, prices } = usePoolData();
  const { balances, refresh: refreshBalances } = useBalances(publicKey);

  const [tab, setTab] = useState<Tab>('add');
  const [tokenA, setTokenA] = useState<TokenMeta>(TOKENS.XLM);
  const [tokenB, setTokenB] = useState<TokenMeta>(TOKENS.USDC);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [removePct, setRemovePct] = useState(50);
  const [lpBalance, setLpBalance] = useState(0n);

  const [selecting, setSelecting] = useState<'A' | 'B' | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const route = useMemo(() => resolvePair(tokenA.sac, tokenB.sac), [tokenA, tokenB]);
  const pool = route ? pools.find(p => p.address === route.pairAddress) : null;

  // Oriented reserves [reserveA, reserveB]
  const reserves = useMemo<[bigint, bigint] | null>(() => {
    if (!route || !pool) return null;
    return route.tokenInIsX ? [pool.reserveX, pool.reserveY] : [pool.reserveY, pool.reserveX];
  }, [route, pool]);

  const isNewPool = reserves != null && reserves[0] === 0n && reserves[1] === 0n;

  // Fetch LP balance for remove tab
  useEffect(() => {
    if (!publicKey || !route) { setLpBalance(0n); return; }
    getLpBalance(publicKey, route.pairAddress).then(setLpBalance).catch(() => setLpBalance(0n));
  }, [publicKey, route, txHash]);

  // Maintain pool ratio when adding to an existing pool
  const onAmountA = (v: string) => {
    setAmountA(v); setError(null); setTxHash(null);
    if (reserves && !isNewPool && v) {
      const b = quote(toStroops(v), reserves[0], reserves[1]);
      setAmountB(b > 0n ? fromStroops(b).toString() : '');
    }
  };
  const onAmountB = (v: string) => {
    setAmountB(v); setError(null); setTxHash(null);
    if (reserves && !isNewPool && v) {
      const a = quote(toStroops(v), reserves[1], reserves[0]);
      setAmountA(a > 0n ? fromStroops(a).toString() : '');
    }
  };

  const pickToken = (token: TokenMeta) => {
    if (selecting === 'A') { if (token.sac === tokenB.sac) setTokenB(tokenA); setTokenA(token); }
    else { if (token.sac === tokenA.sac) setTokenA(tokenB); setTokenB(token); }
    setAmountA(''); setAmountB(''); setError(null);
  };

  const balA = balances[tokenA.sac] ?? 0n;
  const balB = balances[tokenB.sac] ?? 0n;

  const doAdd = async () => {
    if (!publicKey || !amountA || !amountB) return;
    setWorking(true); setError(null); setTxHash(null);
    try {
      const aD = toStroops(amountA);
      const bD = toStroops(amountB);
      const deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINS * 60;
      // 1% min tolerance on liquidity (ratio can shift slightly)
      const hash = await addLiquidity({
        publicKey, tokenA: tokenA.sac, tokenB: tokenB.sac,
        amountADesired: aD, amountBDesired: bD,
        amountAMin: (aD * 99n) / 100n, amountBMin: (bD * 99n) / 100n,
        deadline,
      });
      setTxHash(hash); setAmountA(''); setAmountB(''); refreshBalances();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  };

  const doRemove = async () => {
    if (!publicKey || !route || lpBalance === 0n) return;
    setWorking(true); setError(null); setTxHash(null);
    try {
      const liq = (lpBalance * BigInt(removePct)) / 100n;
      const deadline = Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINS * 60;
      const hash = await removeLiquidity({
        publicKey, pairAddress: route.pairAddress,
        tokenA: tokenA.sac, tokenB: tokenB.sac,
        liquidity: liq, amountAMin: 0n, amountBMin: 0n, deadline,
      });
      setTxHash(hash); refreshBalances();
    } catch (e) { setError((e as Error).message); }
    finally { setWorking(false); }
  };

  // Button state
  let label = tab === 'add' ? 'Add Liquidity' : 'Remove Liquidity';
  let disabled = false;
  let action: (() => void) | null = null;

  if (!isConnected) { label = 'Connect Wallet'; action = connect; }
  else if (!route) { label = 'No pool for this pair'; disabled = true; }
  else if (tab === 'add') {
    if (!amountA || !amountB) { label = 'Enter amounts'; disabled = true; }
    else if (toStroops(amountA) > balA) { label = `Insufficient ${tokenA.symbol}`; disabled = true; }
    else if (toStroops(amountB) > balB) { label = `Insufficient ${tokenB.symbol}`; disabled = true; }
  } else {
    if (lpBalance === 0n) { label = 'No position to remove'; disabled = true; }
  }
  if (working) { label = tab === 'add' ? 'Adding…' : 'Removing…'; disabled = true; }

  const onClick = action ?? (tab === 'add' ? doAdd : doRemove);

  return (
    <div className="card p-2 w-full max-w-[480px]">
      <div className="flex items-center gap-1 bg-bg-module rounded-pill p-1 m-2">
        {(['add', 'remove'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); setTxHash(null); }}
            className={`flex-1 py-2 rounded-pill text-sm font-medium transition-colors ${
              tab === t ? 'bg-bg-interactive text-txt-primary' : 'text-txt-tertiary hover:text-txt-primary'
            }`}
          >
            {t === 'add' ? 'Add' : 'Remove'}
          </button>
        ))}
      </div>

      {tab === 'add' ? (
        <>
          <PoolTokenRow token={tokenA} amount={amountA} onAmount={onAmountA}
            balance={balA} onPick={() => setSelecting('A')} isConnected={isConnected}
            usd={usdValue(tokenA.symbol, parseFloat(amountA) || 0, prices)}
            onMax={() => onAmountA(fromStroops(balA).toString())} />
          <div className="text-center text-txt-tertiary py-1 text-xl">+</div>
          <PoolTokenRow token={tokenB} amount={amountB} onAmount={onAmountB}
            balance={balB} onPick={() => setSelecting('B')} isConnected={isConnected}
            usd={usdValue(tokenB.symbol, parseFloat(amountB) || 0, prices)}
            onMax={() => onAmountB(fromStroops(balB).toString())} />

          {isNewPool && route && (
            <p className="text-state-warning text-xs text-center mt-2 px-3">
              You are the first LP — your deposit sets the initial price.
            </p>
          )}
        </>
      ) : (
        <div className="mx-1 space-y-3">
          <div className="bg-bg-module rounded-module p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-txt-tertiary">Your LP position</span>
              <span className="font-mono text-txt-primary">{fmtAmount(lpBalance)} LP</span>
            </div>
            <div className="text-3xl font-medium text-txt-primary mb-3">{removePct}%</div>
            <input
              type="range" min={1} max={100} value={removePct}
              onChange={e => setRemovePct(parseInt(e.target.value))}
              className="w-full accent-uni-pink"
            />
            <div className="flex gap-2 mt-3">
              {[25, 50, 75, 100].map(p => (
                <button key={p} onClick={() => setRemovePct(p)}
                  className={`flex-1 py-1.5 rounded-pill text-xs font-medium transition-colors ${
                    removePct === p ? 'bg-uni-pink text-white' : 'bg-bg-interactive text-txt-secondary hover:bg-bg-outline'
                  }`}>
                  {p === 100 ? 'MAX' : `${p}%`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-sm text-txt-tertiary">Pool</span>
            <span className="flex items-center gap-1 text-txt-primary text-sm">
              <TokenIcon token={tokenA} size={18} /><TokenIcon token={tokenB} size={18} />
              {tokenA.symbol}/{tokenB.symbol}
            </span>
          </div>
        </div>
      )}

      <button onClick={onClick} disabled={disabled}
        className="btn-pink w-full mt-2 py-4 text-base flex items-center justify-center gap-2">
        {working && <Spinner size={18} />}{label}
      </button>

      {error && <p className="text-state-error text-xs text-center mt-2 px-3 break-words">{error}</p>}
      {txHash && (
        <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
          className="block text-state-success text-xs text-center mt-2 hover:underline">
          ✓ Confirmed — view on Stellar Expert ↗
        </a>
      )}

      <TokenSelector open={selecting !== null} onClose={() => setSelecting(null)}
        onSelect={pickToken} exclude={selecting === 'A' ? tokenB.sac : tokenA.sac} balances={balances} />
    </div>
  );
}

function PoolTokenRow({
  token, amount, onAmount, balance, onPick, onMax, usd, isConnected,
}: {
  token: TokenMeta; amount: string; onAmount: (v: string) => void;
  balance: bigint; onPick: () => void; onMax: () => void; usd: number; isConnected: boolean;
}) {
  return (
    <div className="mx-1 bg-bg-module rounded-module p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-txt-tertiary">{usd > 0 ? fmtUsd(usd) : 'Amount'}</span>
        {isConnected && (
          <span className="text-xs text-txt-tertiary">
            Balance: {fmtAmount(balance)}
            {balance > 0n && <button onClick={onMax} className="text-uni-pink font-semibold ml-1">MAX</button>}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input type="number" inputMode="decimal" placeholder="0" value={amount}
          onChange={e => onAmount(e.target.value)}
          className="bg-transparent text-3xl font-medium text-txt-primary placeholder:text-txt-disabled flex-1 min-w-0 focus:outline-none" />
        <button onClick={onPick}
          className="flex items-center gap-2 bg-bg-interactive hover:bg-bg-outline rounded-pill pl-2 pr-3 py-1.5 transition-colors shrink-0">
          <TokenIcon token={token} size={24} />
          <span className="font-semibold text-txt-primary">{token.symbol}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-txt-tertiary">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
