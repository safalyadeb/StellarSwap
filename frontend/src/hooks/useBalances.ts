'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TOKEN_LIST } from '../lib/constants';
import { getTokenBalance } from '../lib/soroban';

export type BalanceMap = Record<string, bigint>; // keyed by SAC address

const POLL_MS = 12_000;

/** Polls SAC balances for all known tokens for the connected account. */
export function useBalances(publicKey: string | null) {
  const [balances, setBalances] = useState<BalanceMap>({});
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!publicKey) {
      setBalances({});
      return;
    }
    setLoading(true);
    try {
      const entries = await Promise.all(
        TOKEN_LIST.map(async (t) => [t.sac, await getTokenBalance(publicKey, t.sac)] as const),
      );
      if (!mounted.current) return;
      setBalances(Object.fromEntries(entries));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [refresh]);

  return { balances, loading, refresh };
}
