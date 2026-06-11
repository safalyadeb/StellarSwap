'use client';

import { useState, useRef, useEffect } from 'react';
import { SLIPPAGE_PRESETS } from '../lib/constants';

export function SettingsPopover({
  slippageBps,
  setSlippageBps,
  deadlineMins,
  setDeadlineMins,
}: {
  slippageBps: number;
  setSlippageBps: (v: number) => void;
  deadlineMins: number;
  setDeadlineMins: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const isPreset = SLIPPAGE_PRESETS.includes(slippageBps);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-txt-tertiary hover:text-txt-primary transition-colors p-1.5 rounded-lg hover:bg-bg-module"
        aria-label="Settings"
        title="Transaction settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 card p-4 z-50 animate-slideUp">
          <div className="text-sm font-semibold text-txt-primary mb-3">Settings</div>

          <label className="text-xs text-txt-tertiary">Slippage tolerance</label>
          <div className="flex gap-2 mt-2 mb-4">
            {SLIPPAGE_PRESETS.map(bps => (
              <button
                key={bps}
                onClick={() => { setSlippageBps(bps); setCustom(''); }}
                className={`flex-1 py-1.5 rounded-pill text-xs font-medium transition-colors ${
                  slippageBps === bps && !custom
                    ? 'bg-uni-pink text-white'
                    : 'bg-bg-module text-txt-secondary hover:bg-bg-interactive'
                }`}
              >
                {(bps / 100).toFixed(1)}%
              </button>
            ))}
            <div className={`flex items-center bg-bg-module rounded-pill px-2 ${!isPreset || custom ? 'ring-1 ring-uni-pink/50' : ''}`}>
              <input
                value={custom}
                onChange={e => {
                  setCustom(e.target.value);
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v) && v > 0 && v <= 50) setSlippageBps(Math.round(v * 100));
                }}
                placeholder="Custom"
                className="w-14 bg-transparent text-right text-xs text-txt-primary focus:outline-none"
              />
              <span className="text-txt-tertiary text-xs">%</span>
            </div>
          </div>

          <label className="text-xs text-txt-tertiary">Transaction deadline</label>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="number"
              value={deadlineMins}
              onChange={e => setDeadlineMins(Math.max(1, parseInt(e.target.value) || 20))}
              className="w-16 bg-bg-module rounded-pill px-3 py-1.5 text-sm text-txt-primary focus:outline-none"
            />
            <span className="text-txt-tertiary text-sm">minutes</span>
          </div>
        </div>
      )}
    </div>
  );
}
