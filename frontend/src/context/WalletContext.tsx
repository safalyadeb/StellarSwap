'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import { connectWallet, getPermittedConnection } from '../lib/wallet';
import { track, identifyWallet, resetIdentity } from '../lib/analytics';

interface WalletContextValue {
  publicKey: string | null;
  network: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = 'stellarswap.connected';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    track('wallet_connect_started');
    try {
      // Detects Freighter, requests access (opens the approval popup), and
      // returns the granted address + active network. See lib/wallet.ts.
      const { address, network: net } = await connectWallet();
      setPublicKey(address);
      setNetwork(net);
      localStorage.setItem(STORAGE_KEY, '1');
      identifyWallet(address);
      track('wallet_connected', { network: net ?? 'unknown' });
    } catch (e) {
      setError((e as Error).message);
      track('wallet_connect_failed', { reason: 'error' });
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setNetwork(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    track('wallet_disconnected');
    resetIdentity();
  }, []);

  // Re-hydrate connection on mount if previously connected
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) !== '1') return;
    (async () => {
      try {
        // Re-hydrate only if Freighter is installed and the app still holds
        // permission (isAllowed) — reads address + network without a popup.
        const conn = await getPermittedConnection();
        if (conn) {
          setPublicKey(conn.address);
          setNetwork(conn.network);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        network,
        isConnected: !!publicKey,
        isConnecting,
        error,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
