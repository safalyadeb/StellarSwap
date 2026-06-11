'use client';

import { useToast, ToastItem } from '../../context/ToastContext';
import { EXPLORER } from '../../lib/constants';

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map(t => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { type, title, message, txHash, leaving } = toast;

  const anim = leaving ? 'animate-slideOutRight' : 'animate-slideInRight';

  const border   = type === 'success' ? 'border-state-success/40' : type === 'error' ? 'border-state-error/40' : 'border-uni-pink/40';
  const iconCls  = type === 'success' ? 'text-state-success'       : type === 'error' ? 'text-state-error'       : 'text-uni-pink';
  const barTrack = type === 'success' ? 'bg-state-success/20'       : type === 'error' ? 'bg-state-error/20'       : 'bg-uni-pink/20';
  const barFill  = type === 'success' ? 'bg-state-success'          : type === 'error' ? 'bg-state-error'          : 'bg-uni-pink';

  return (
    <div className={`pointer-events-auto w-80 rounded-module bg-bg-surface border ${border} shadow-card px-4 py-3 ${anim}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span className={`${iconCls} mt-0.5 shrink-0`}>
          {type === 'success' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
          {type === 'error' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9"  y1="9" x2="15" y2="15"/>
            </svg>
          )}
          {type === 'info' && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </span>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-txt-primary leading-snug">{title}</p>
          {message && <p className="text-xs text-txt-secondary mt-0.5 break-words">{message}</p>}
          {txHash && (
            <a
              href={`${EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-uni-pink hover:underline mt-1"
            >
              View on Stellar Expert ↗
            </a>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={onDismiss}
          className="text-txt-disabled hover:text-txt-secondary transition-colors shrink-0 -mr-1 -mt-0.5 p-0.5"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6"  y2="18"/>
            <line x1="6"  y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* 5s drain progress bar */}
      <div className={`mt-2.5 h-0.5 rounded-full overflow-hidden ${barTrack}`}>
        <div className={`h-full rounded-full toast-drain ${barFill}`} />
      </div>
    </div>
  );
}
