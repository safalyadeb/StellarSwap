// The frontend is its own deployable unit, so it bundles a snapshot of the
// testnet contract addresses. Keep in sync with the repo-root config/testnet.json
// (written by scripts/deploy/deploy_all.sh) after any redeploy.
import testnetConfig from '../config/testnet.json';

// Default to testnet. Only an explicit "local" selects the standalone network —
// any other value (including a stray-newline env var) safely resolves to testnet.
const RAW_NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'testnet').trim().toLowerCase();
export const NETWORK: 'testnet' | 'local' = RAW_NETWORK === 'local' ? 'local' : 'testnet';

export const NETWORK_PASSPHRASE =
  NETWORK === 'local'
    ? 'Standalone Network ; February 2017'
    : testnetConfig.networkPassphrase ?? 'Test SDF Network ; September 2015';

export const STELLAR_RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ?? testnetConfig.rpcUrl ?? 'https://soroban-testnet.stellar.org';

export const STELLAR_HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL ?? testnetConfig.horizonUrl ?? 'https://horizon-testnet.stellar.org';

export const EXPLORER = 'https://stellar.expert/explorer/testnet';

export const CONTRACTS = testnetConfig.contracts;

/** Deployer G-address — source account for read-only simulations. */
export const READ_ACCOUNT = testnetConfig.deployer;

// ── Tokens ─────────────────────────────────────────────────────────────────────

export interface TokenMeta {
  sac: string;
  symbol: string;
  name: string;
  decimals: number;
  issuer: string | null;
  color: string; // brand color for the token chip
}

const TOKEN_COLORS: Record<string, string> = {
  XLM: '#000000',
  USDC: '#2775CA',
  EURC: '#1A4FBF',
};

export const TOKENS: Record<string, TokenMeta> = Object.fromEntries(
  Object.entries(testnetConfig.tokens).map(([sym, t]: [string, any]) => [
    sym,
    {
      sac: t.sac,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals ?? 7,
      issuer: t.issuer ?? null,
      color: TOKEN_COLORS[sym] ?? '#FF007A',
    },
  ]),
);

export const TOKEN_LIST: TokenMeta[] = Object.values(TOKENS);

export function tokenBySac(sac: string): TokenMeta | undefined {
  return TOKEN_LIST.find(t => t.sac === sac);
}

// ── Pairs ───────────────────────────────────────────────────────────────────────

export interface PairConfig {
  address: string;
  token_x: string;
  token_y: string;
  symbol_x: string;
  symbol_y: string;
}

export const PAIRS: Record<string, PairConfig> = testnetConfig.pairs as any;
export const PAIR_LIST = Object.entries(PAIRS).map(([name, p]) => ({ name, ...p }));

/**
 * Resolve the pool for a (tokenIn, tokenOut) pair.
 * Returns the address and whether tokenIn is the pool's token_x
 * (needed to orient reserves correctly).
 */
export function resolvePair(
  tokenIn: string,
  tokenOut: string,
): { pairAddress: string; tokenInIsX: boolean; name: string } | null {
  for (const [name, pair] of Object.entries(PAIRS)) {
    if (pair.token_x === tokenIn && pair.token_y === tokenOut)
      return { pairAddress: pair.address, tokenInIsX: true, name };
    if (pair.token_y === tokenIn && pair.token_x === tokenOut)
      return { pairAddress: pair.address, tokenInIsX: false, name };
  }
  return null;
}

// ── Price anchoring ──────────────────────────────────────────────────────────
// USDC is the $1 anchor. Other token prices are derived live from pool reserves.

export const USD_ANCHOR_SYMBOL = 'USDC';

// ── UI defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_SLIPPAGE_BPS = 50;     // 0.5%
export const DEFAULT_DEADLINE_MINS = 20;
export const SLIPPAGE_PRESETS = [10, 50, 100]; // 0.1%, 0.5%, 1.0%
