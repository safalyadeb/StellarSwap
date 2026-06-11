'use client';

import { ReactNode, useEffect } from 'react';

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 420,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="card w-full p-0 animate-slideUp overflow-hidden"
        style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-bg-interactive">
          <h3 className="font-semibold text-txt-primary">{title}</h3>
          <button
            onClick={onClose}
            className="text-txt-tertiary hover:text-txt-primary transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
