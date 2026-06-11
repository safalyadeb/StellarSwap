export const STROOPS = 10_000_000n; // 10^7

/** stroops (bigint) → human number */
export function fromStroops(v: bigint): number {
  return Number(v) / 1e7;
}

/** human string → stroops (bigint), safe for decimals */
export function toStroops(v: string): bigint {
  if (!v || isNaN(Number(v))) return 0n;
  const [whole, frac = ''] = v.split('.');
  const fracPadded = (frac + '0000000').slice(0, 7);
  return BigInt(whole || '0') * STROOPS + BigInt(fracPadded || '0');
}

/** Format a token amount for display. */
export function fmtAmount(v: bigint | number, maxDecimals = 6): string {
  const n = typeof v === 'bigint' ? fromStroops(v) : v;
  if (n === 0) return '0';
  if (n < 0.000001) return '<0.000001';
  if (n < 1) return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
  if (n < 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Format a USD value. */
export function fmtUsd(n: number): string {
  if (!isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

/** Format a percentage from a 0..1 fraction. */
export function fmtPct(frac: number, decimals = 2): string {
  return `${(frac * 100).toFixed(decimals)}%`;
}

/** Shorten a Stellar address: GABC…WXYZ */
export function shortAddr(addr: string, lead = 4, tail = 4): string {
  if (!addr) return '';
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}
