'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { usePoolData, usdValue } from '../../hooks/usePoolData';
import { useBalances } from '../../hooks/useBalances';
import { TokenIcon } from '../ui/TokenIcon';
import { Spinner } from '../ui/Spinner';
import { TokenSelector } from '../TokenSelector';
import { SettingsPopover } from '../SettingsPopover';
import { TOKENS, TokenMeta, resolvePair, DEFAULT_SLIPPAGE_BPS, DEFAULT_DEADLINE_MINS } from '../../lib/constants';
import { getAmountOut, getAmountIn, priceImpact, midPrice } from '../../lib/math';
import { fromStroops, toStroops, fmtAmount, fmtUsd, fmtPct } from '../../lib/format';
import { swapExactIn, swapExactOut, ensureTrustline } from '../../lib/soroban';
import { track } from '../../lib/analytics';
import { addBreadcrumb, captureError } from '../../lib/monitoring';

type Side = 'in' | 'out';

export function SwapWidget() {
  const { publicKey, isConnected, connect } = useWallet();
  const { pools, prices } = usePoolData();
  const { balances, refresh: refreshBalances } = useBalances(publicKey);
  const toast = useToast();

  const [tokenIn,  setTokenIn]  = useState<TokenMeta>(TOKENS.XLM);
  const [tokenOut, setTokenOut] = useState<TokenMeta>(TOKENS.USDC);
  const [amountIn,  setAmountIn]  = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [exactSide, setExactSide] = useState<Side>('in');

  const [slippageBps,  setSlippageBps]  = useState(DEFAULT_SLIPPAGE_BPS);
  const [deadlineMins, setDeadlineMins] = useState(DEFAULT_DEADLINE_MINS);

  const [selecting, setSelecting] = useState<Side | null>(null);
  const [swapping,  setSwapping]  = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Pool routing ──────────────────────────────────────────────────────────
  const route = useMemo(() => resolvePair(tokenIn.sac, tokenOut.sac), [tokenIn, tokenOut]);
  const reserves = useMemo<[bigint, bigint] | null>(() => {
    if (!route) return null;
    const pool = pools.find(p => p.address === route.pairAddress);
    if (!pool) return null;
    return route.tokenInIsX ? [pool.reserveX, pool.reserveY] : [pool.reserveY, pool.reserveX];
  }, [route, pools]);

  const balIn  = balances[tokenIn.sac]  ?? 0n;
  const balOut = balances[tokenOut.sac] ?? 0n;

  // ── Bidirectional quoting ─────────────────────────────────────────────────
  const recompute = useCallback(
    (side: Side, value: string) => {
      if (!reserves) {
        if (side === 'in') { setAmountIn(value); setAmountOut(''); }
        else               { setAmountOut(value); setAmountIn(''); }
        return;
      }
      const [rIn, rOut] = reserves;
      if (side === 'in') {
        setExactSide('in');
        setAmountIn(value);
        const out = getAmountOut(toStroops(value), rIn, rOut);
        setAmountOut(out > 0n ? fromStroops(out).toString() : '');
      } else {
        setExactSide('out');
        setAmountOut(value);
        const needed = getAmountIn(toStroops(value), rIn, rOut);
        setAmountIn(needed > 0n ? fromStroops(needed).toString() : '');
      }
    },
    [reserves],
  );

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut(amountIn);
    setExactSide(s => (s === 'in' ? 'out' : 'in'));
  };

  const pickToken = (token: TokenMeta) => {
    if (selecting === 'in') {
      if (token.sac === tokenOut.sac) setTokenOut(tokenIn);
      setTokenIn(token);
    } else {
      if (token.sac === tokenIn.sac) setTokenIn(tokenOut);
      setTokenOut(token);
    }
    setAmountIn(''); setAmountOut('');
    setSelecting(null);
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const impact = reserves && amountIn ? priceImpact(toStroops(amountIn), reserves[0], reserves[1]) : 0;
  const rate   = reserves ? midPrice(reserves[0], reserves[1]) : 0;
  const usdIn  = amountIn  ? usdValue(tokenIn.symbol,  parseFloat(amountIn)  || 0, prices) : 0;
  const usdOut = amountOut ? usdValue(tokenOut.symbol, parseFloat(amountOut) || 0, prices) : 0;

  const insufficientBal = !!amountIn && toStroops(amountIn) > balIn;
  const noLiquidity     = !!amountIn && reserves != null && reserves[1] === 0n;

  // ── Button state ──────────────────────────────────────────────────────────
  let btnLabel    = 'Swap';
  let btnDisabled = false;
  let btnAction: (() => void) | null = null;

  if (!isConnected)                                        { btnLabel = 'Connect Wallet'; btnAction = connect; }
  else if (!route)                                         { btnLabel = 'No pool for this pair'; btnDisabled = true; }
  else if (!amountIn || parseFloat(amountIn) <= 0)         { btnLabel = 'Enter an amount'; btnDisabled = true; }
  else if (insufficientBal)                                { btnLabel = `Insufficient ${tokenIn.symbol}`; btnDisabled = true; }
  else if (!amountOut || parseFloat(amountOut) <= 0)       { btnLabel = 'Insufficient liquidity'; btnDisabled = true; }
  else if (swapping)                                       { btnLabel = statusMsg || 'Swapping…'; btnDisabled = true; }

  // ── Swap execution ────────────────────────────────────────────────────────
  const doSwap = async () => {
    if (!publicKey || !reserves) return;
    setSwapping(true);
    setStatusMsg('');
    track('swap_submitted', {
      pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      exactSide,
      priceImpact: Number(impact.toFixed(6)),
    });
    addBreadcrumb('swap submitted', { pair: `${tokenIn.symbol}/${tokenOut.symbol}`, exactSide });
    try {
      if (tokenOut.issuer) {
        setStatusMsg('Setting up token trustline…');
        await ensureTrustline(publicKey, tokenOut.symbol, tokenOut.issuer);
      }

      const onProgress = (msg: string) => setStatusMsg(msg);
      const deadline   = Math.floor(Date.now() / 1000) + deadlineMins * 60;
      const slip       = BigInt(10_000 - slippageBps);
      const slipUp     = BigInt(10_000 + slippageBps);
      const savedOut   = amountOut;
      let hash: string;

      if (exactSide === 'in') {
        const inS    = toStroops(amountIn);
        const outS   = toStroops(amountOut);
        const minOut = (outS * slip) / 10_000n;
        hash = await swapExactIn({
          publicKey, amountIn: inS, amountOutMin: minOut,
          tokenIn: tokenIn.sac, tokenOut: tokenOut.sac, deadline, onProgress,
        });
      } else {
        const outS   = toStroops(amountOut);
        const inS    = toStroops(amountIn);
        const maxIn  = (inS * slipUp) / 10_000n;
        hash = await swapExactOut({
          publicKey, amountOut: outS, amountInMax: maxIn,
          tokenIn: tokenIn.sac, tokenOut: tokenOut.sac, deadline, onProgress,
        });
      }

      setAmountIn(''); setAmountOut('');
      refreshBalances();
      track('swap_succeeded', {
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        txHash: hash,
      });
      toast.success('Swap Successful', {
        message: `You received ${parseFloat(savedOut).toFixed(6)} ${tokenOut.symbol}`,
        txHash: hash,
      });
    } catch (e: any) {
      track('swap_failed', {
        pair: `${tokenIn.symbol}/${tokenOut.symbol}`,
        message: (e as Error).message?.slice(0, 120),
      });
      captureError(e, { scope: 'swap', pair: `${tokenIn.symbol}/${tokenOut.symbol}`, exactSide });
      toast.error('Swap Failed', { message: (e as Error).message });
    } finally {
      setSwapping(false);
      setStatusMsg('');
    }
  };

  const onButtonClick = btnAction ?? doSwap;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card p-2 w-full max-w-[480px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="font-semibold text-txt-primary">Swap</h2>
        <SettingsPopover
          slippageBps={slippageBps}
          setSlippageBps={setSlippageBps}
          deadlineMins={deadlineMins}
          setDeadlineMins={setDeadlineMins}
        />
      </div>

      {/* Pay */}
      <TokenRow
        label="You pay"
        token={tokenIn}
        amount={amountIn}
        onAmount={v => recompute('in', v)}
        usd={usdIn}
        balance={balIn}
        onMax={() => recompute('in', fromStroops(balIn).toString())}
        onPick={() => setSelecting('in')}
        showMax={isConnected}
      />

      {/* Flip button — centred between the two cards with real spacing */}
      <div className="flex justify-center items-center py-2">
        <button
          onClick={flip}
          className="w-9 h-9 rounded-xl bg-bg-module border border-bg-interactive
                     flex items-center justify-center text-txt-secondary
                     hover:text-uni-pink hover:border-uni-pink/40 transition-colors"
          aria-label="Switch tokens"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>
          </svg>
        </button>
      </div>

      {/* Receive */}
      <TokenRow
        label="You receive"
        token={tokenOut}
        amount={amountOut}
        onAmount={v => recompute('out', v)}
        usd={usdOut}
        balance={balOut}
        onPick={() => setSelecting('out')}
        showMax={false}
      />

      {/* Rate / impact summary */}
      {route && amountIn && amountOut && (
        <div className="mx-1 mt-2 px-3 py-2.5 bg-bg-module/50 rounded-module text-xs space-y-1.5">
          <Row label="Rate">
            1 {tokenIn.symbol} = {fmtAmount(route.tokenInIsX ? rate : (rate === 0 ? 0 : 1 / rate))} {tokenOut.symbol}
          </Row>
          <Row label="Price impact">
            <span className={impact < 0.01 ? 'text-state-success' : impact < 0.05 ? 'text-state-warning' : 'text-state-error'}>
              {fmtPct(impact)}
            </span>
          </Row>
          <Row label={exactSide === 'in' ? 'Min. received' : 'Max. sold'}>
            {exactSide === 'in'
              ? `${fmtAmount((parseFloat(amountOut) * (10000 - slippageBps)) / 10000)} ${tokenOut.symbol}`
              : `${fmtAmount((parseFloat(amountIn)  * (10000 + slippageBps)) / 10000)} ${tokenIn.symbol}`}
          </Row>
          <Row label="Slippage tolerance">{(slippageBps / 100).toFixed(1)}%</Row>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={onButtonClick}
        disabled={btnDisabled}
        className="btn-pink w-full mt-2 py-4 text-base flex items-center justify-center gap-2"
      >
        {swapping && <Spinner size={18} />}
        {btnLabel}
      </button>

      {/* Live phase status (shown while swapping) */}
      {swapping && statusMsg && (
        <p className="text-txt-tertiary text-xs text-center mt-2 animate-pulse">{statusMsg}</p>
      )}

      <TokenSelector
        open={selecting !== null}
        onClose={() => setSelecting(null)}
        onSelect={pickToken}
        exclude={selecting === 'in' ? tokenOut.sac : tokenIn.sac}
        balances={balances}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TokenRow({
  label, token, amount, onAmount, usd, balance, onMax, onPick, showMax,
}: {
  label: string;
  token: TokenMeta;
  amount: string;
  onAmount: (v: string) => void;
  usd: number;
  balance: bigint;
  onMax?: () => void;
  onPick: () => void;
  showMax: boolean;
}) {
  return (
    <div className="mx-1 bg-bg-module rounded-module p-4 border border-transparent
                    focus-within:border-bg-interactive transition-colors min-h-[128px] flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-txt-tertiary">{label}</span>
        {showMax && (
          <span className="text-xs text-txt-tertiary">
            Balance: {fmtAmount(balance)}{' '}
            {onMax && balance > 0n && (
              <button onClick={onMax} className="text-uni-pink font-semibold ml-1 hover:brightness-110">
                MAX
              </button>
            )}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={e => onAmount(e.target.value)}
          className="bg-transparent text-3xl font-medium text-txt-primary placeholder:text-txt-disabled flex-1 min-w-0 focus:outline-none"
        />
        <button
          onClick={onPick}
          className="flex items-center gap-2 bg-bg-interactive hover:bg-bg-outline rounded-pill pl-2 pr-3 py-1.5 transition-colors shrink-0"
        >
          <TokenIcon token={token} size={24} />
          <span className="font-semibold text-txt-primary">{token.symbol}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-txt-tertiary">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
      </div>

      <div className="text-xs text-txt-tertiary mt-1 h-4">
        {usd > 0 ? fmtUsd(usd) : ''}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-txt-tertiary">{label}</span>
      <span className="text-txt-secondary">{children}</span>
    </div>
  );
}
