'use client';

import { useState, useRef, useEffect } from 'react';
import { useWallet } from '../context/WalletContext';
import { shortAddr } from '../lib/format';
import { Spinner } from './ui/Spinner';

export function ConnectButton() {
  const { publicKey, network, isConnected, isConnecting, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-end">
        <button
          onClick={connect}
          disabled={isConnecting}
          className="btn-pink-soft px-4 py-2 text-sm flex items-center gap-2"
        >
          {isConnecting && <Spinner size={14} />}
          {isConnecting ? 'Connecting…' : 'Connect Wallet'}
        </button>
        {error && (
          <span className="text-state-error text-[11px] mt-1 max-w-[220px] text-right">{error}</span>
        )}
      </div>
    );
  }

  const wrongNetwork = network && !/test/i.test(network);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-bg-module hover:bg-bg-interactive border border-bg-interactive rounded-pill px-3 py-2 text-sm font-medium text-txt-primary flex items-center gap-2 transition-colors"
      >
        <span className="w-2 h-2 rounded-full" style={{ background: wrongNetwork ? '#FD4040' : '#27AE60' }} />
        {shortAddr(publicKey!)}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 card p-3 z-50 animate-slideUp">
          <div className="text-xs text-txt-tertiary mb-1">Connected with Freighter</div>
          <div className="font-mono text-sm text-txt-primary break-all mb-3">{shortAddr(publicKey!, 8, 8)}</div>
          <div className="flex items-center justify-between text-xs mb-3">
            <span className="text-txt-tertiary">Network</span>
            <span className={wrongNetwork ? 'text-state-error' : 'text-state-success'}>
              {network ?? 'unknown'}
            </span>
          </div>
          {wrongNetwork && (
            <p className="text-state-error text-[11px] mb-2">Switch Freighter to Testnet.</p>
          )}
          <button
            onClick={() => { disconnect(); setOpen(false); }}
            className="w-full bg-bg-module hover:bg-bg-interactive rounded-pill py-2 text-sm text-txt-secondary transition-colors"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
