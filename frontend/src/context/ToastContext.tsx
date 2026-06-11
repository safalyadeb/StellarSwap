'use client';

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  txHash?: string;
  leaving?: boolean;
}

interface ToastContextValue {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
  success: (title: string, opts?: { message?: string; txHash?: string }) => void;
  error:   (title: string, opts?: { message?: string }) => void;
  info:    (title: string, opts?: { message?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;
const EXIT_ANIM_MS    = 260;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    // Mark as leaving so the exit animation plays, then remove
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, EXIT_ANIM_MS);
  }, []);

  const add = useCallback((item: Omit<ToastItem, 'id' | 'leaving'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { ...item, id }]);

    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    timers.current.set(id, timer);
  }, [dismiss]);

  const success = useCallback((title: string, opts?: { message?: string; txHash?: string }) =>
    add({ type: 'success', title, ...opts }), [add]);

  const error = useCallback((title: string, opts?: { message?: string }) =>
    add({ type: 'error', title, ...opts }), [add]);

  const info = useCallback((title: string, opts?: { message?: string }) =>
    add({ type: 'info', title, ...opts }), [add]);

  return (
    <ToastContext.Provider value={{ toasts, dismiss, success, error, info }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
