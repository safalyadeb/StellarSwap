'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import {
  isConnected as freighterIsConnected,
  isAllowed,
  setAllowed,
  requestAccess,
  getAddress,
  getNetwork,
} from '@stellar/freighter-api';

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
    try {
      const conn = await freighterIsConnected();
      if (!conn.isConnected) {
        setError('Freighter not detected. Install the Freighter extension and refresh.');
        return;
      }

      // requestAccess opens the Freighter approval popup and returns the address
      const access = await requestAccess();
      if (access.error) {
        setError(typeof access.error === 'string' ? access.error : 'Connection rejected');
        return;
      }

      const net = await getNetwork();
      setPublicKey(access.address);
      setNetwork(net.network ?? null);
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setNetwork(null);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Re-hydrate connection on mount if previously connected
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY) !== '1') return;
    (async () => {
      try {
        const conn = await freighterIsConnected();
        if (!conn.isConnected) return;
        const allowed = await isAllowed();
        if (!allowed.isAllowed) return;
        const addr = await getAddress();
        if (addr.address) {
          const net = await getNetwork();
          setPublicKey(addr.address);
          setNetwork(net.network ?? null);
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
