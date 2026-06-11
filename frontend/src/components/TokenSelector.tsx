'use client';

import { useState } from 'react';
import { Modal } from './ui/Modal';
import { TokenIcon } from './ui/TokenIcon';
import { TOKEN_LIST, TokenMeta } from '../lib/constants';
import { BalanceMap } from '../hooks/useBalances';
import { fmtAmount } from '../lib/format';

export function TokenSelector({
  open,
  onClose,
  onSelect,
  exclude,
  balances,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (token: TokenMeta) => void;
  exclude?: string; // sac to grey out
  balances?: BalanceMap;
}) {
  const [query, setQuery] = useState('');

  const filtered = TOKEN_LIST.filter(
    t =>
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <Modal open={open} onClose={onClose} title="Select a token">
      <div className="p-4">
        <input
          autoFocus
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name or symbol"
          className="w-full bg-bg-module border border-bg-interactive rounded-module px-4 py-3 text-txt-primary placeholder:text-txt-disabled focus:outline-none focus:border-uni-pink/50"
        />
      </div>

      {/* Common bases */}
      <div className="px-4 pb-3 flex flex-wrap gap-2">
        {TOKEN_LIST.map(t => (
          <button
            key={t.sac}
            disabled={t.sac === exclude}
            onClick={() => { onSelect(t); onClose(); }}
            className="flex items-center gap-1.5 bg-bg-module hover:bg-bg-interactive disabled:opacity-30 disabled:cursor-not-allowed border border-bg-interactive rounded-pill pl-1.5 pr-3 py-1 text-sm transition-colors"
          >
            <TokenIcon token={t} size={20} />
            {t.symbol}
          </button>
        ))}
      </div>

      <div className="border-t border-bg-interactive max-h-72 overflow-y-auto">
        {filtered.map(t => {
          const bal = balances?.[t.sac];
          return (
            <button
              key={t.sac}
              disabled={t.sac === exclude}
              onClick={() => { onSelect(t); onClose(); }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-module disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <div className="flex items-center gap-3">
                <TokenIcon token={t} size={32} />
                <div className="text-left">
                  <div className="text-txt-primary font-medium">{t.symbol}</div>
                  <div className="text-txt-tertiary text-xs">{t.name}</div>
                </div>
              </div>
              {bal != null && bal > 0n && (
                <span className="text-txt-secondary text-sm font-mono">{fmtAmount(bal)}</span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-txt-tertiary text-sm">No tokens found</div>
        )}
      </div>
    </Modal>
  );
}
